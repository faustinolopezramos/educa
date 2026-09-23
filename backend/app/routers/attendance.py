from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.core.clock import academy_today
from app.core.database import get_db
from app.core.deps import (
    apply_tenant,
    enrollment_in_scope_or_404,
    get_current_user,
    require_staff_permission,
    teacher_course_ids,
    teacher_teaches_course,
)
from app.models import (
    Attendance,
    AttendanceStatus,
    ClassSession,
    Course,
    ENROLLMENT_OCCUPIES_SEAT,
    ENROLLMENT_STATUS_LABELS,
    Enrollment,
    MakeUpCredit,
    MakeUpStatus,
    Permission,
    Schedule,
    SessionStatus,
    User,
    UserRole,
)
from app.schemas.attendance import (
    AttendanceCreate,
    AttendanceRead,
    AttendanceUpdate,
    BulkAttendanceRequest,
    BulkAttendanceResponse,
)
from app.services.audit import record as record_audit
from app.services.audit import snapshot
from app.services.sessions import mark_held

router = APIRouter(prefix="/attendance", tags=["attendance"])

staff_only = require_staff_permission(Permission.manage_grades)


def _handle_excused_makeup_credit(db: Session, enrollment: Enrollment, session_id: int) -> None:
    """Issue a MakeUpCredit if student was excused and has no existing credit for this session."""
    existing = db.scalar(
        select(MakeUpCredit).where(
            MakeUpCredit.enrollment_id == enrollment.id,
            MakeUpCredit.origin_session_id == session_id,
        )
    )
    if existing is None:
        course = db.get(Course, enrollment.course_id)
        tenant_id = course.tenant_id if course else None
        credit = MakeUpCredit(
            tenant_id=tenant_id,
            student_id=enrollment.student_id,
            enrollment_id=enrollment.id,
            origin_session_id=session_id,
            status=MakeUpStatus.available,
            expires_at=academy_today() + timedelta(days=60),
            notes="Inasistencia justificada (auto-generado)",
        )
        db.add(credit)


def _ensure_teacher_owns_enrollment(
    db: Session, user: User, enrollment: Enrollment
) -> None:
    """Teachers may only manage attendance for courses they teach."""
    if user.role == UserRole.teacher and not teacher_teaches_course(
        db, user.id, enrollment.course_id
    ):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "No enseñas este curso",
        )


def _session_for_enrollment(
    db: Session, session_id: int, enrollment: Enrollment
) -> ClassSession:
    """The session, guaranteed to belong to the enrollment's course, or 400/404.

    A student can only be marked for a session of the course they are enrolled
    in — otherwise a mark would attach to a class they do not attend.
    """
    session = db.get(ClassSession, session_id)
    if session is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    session_course_id = db.scalar(
        select(Schedule.course_id).where(Schedule.id == session.schedule_id)
    )
    if session_course_id != enrollment.course_id:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "La sesión no pertenece al curso de esta matrícula",
        )
    # Nobody attended a class that was called off, so a mark against one is
    # always a mistake — usually the wrong row tapped on a list that still
    # showed it. It also fed the reports, which count a cancelled session as
    # not held while its attendance kept counting.
    if session.status == SessionStatus.cancelled:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "La clase fue cancelada; no se puede pasar lista sobre ella",
        )
    return session


def _ensure_enrollment_is_live(enrollment: Enrollment) -> None:
    """Refuse marks against a matrícula that is no longer in the room.

    A student who dropped out, finished, or paused the course is not somebody
    who can be present or absent from it — recording either quietly changes the
    attendance rate the reports and the at-risk sweep are built on.
    """
    if enrollment.status not in ENROLLMENT_OCCUPIES_SEAT:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            (
                f"La matrícula está en «{ENROLLMENT_STATUS_LABELS[enrollment.status]}»; "
                "no se puede registrar asistencia sobre ella"
            ),
        )


@router.get("", response_model=list[AttendanceRead])
def list_attendance(
    enrollment_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[Attendance]:
    # A mark reaches its academy through enrollment → course, the same hop the
    # grades list makes. Unscoped, this handed an admin every mark in the
    # installation.
    stmt = apply_tenant(
        select(Attendance)
        .join(Enrollment, Attendance.enrollment_id == Enrollment.id)
        .join(Course, Enrollment.course_id == Course.id),
        Course.tenant_id,
        current_user,
    )
    if enrollment_id is not None:
        stmt = stmt.where(Attendance.enrollment_id == enrollment_id)
    # Students only see their own attendance.
    if current_user.role == UserRole.student:
        stmt = stmt.where(Enrollment.student_id == current_user.id)
    # Teachers only see attendance for their own courses.
    elif current_user.role == UserRole.teacher:
        course_ids = teacher_course_ids(db, current_user.id)
        stmt = stmt.where(Enrollment.course_id.in_(course_ids or [-1]))
    return list(db.scalars(stmt).all())


@router.post("", response_model=AttendanceRead, status_code=status.HTTP_201_CREATED)
def create_attendance(
    payload: AttendanceCreate,
    response: Response,
    db: Session = Depends(get_db),
    current_user: User = Depends(staff_only),
) -> Attendance:
    """Mark a student for a class session.

    Marking is idempotent per (enrollment, session): a teacher who taps
    "presente" and then corrects it to "tarde" is fixing one record, not filing
    a second one. The upsert is a single statement so two taps in flight at once
    cannot both insert. 201 when the mark is new, 200 when it corrects one.
    """
    enrollment = enrollment_in_scope_or_404(db, current_user, payload.enrollment_id)
    _ensure_teacher_owns_enrollment(db, current_user, enrollment)
    _ensure_enrollment_is_live(enrollment)
    session = _session_for_enrollment(db, payload.session_id, enrollment)

    existing = db.scalar(
        select(Attendance).where(
            Attendance.enrollment_id == payload.enrollment_id,
            Attendance.session_id == payload.session_id,
        )
    )
    before = snapshot(existing) if existing else None

    stmt = (
        pg_insert(Attendance)
        .values(**payload.model_dump())
        .on_conflict_do_update(
            constraint="uq_attendance_enrollment_session",
            set_={"status": payload.status},
        )
        .returning(Attendance)
    )
    record = db.scalars(stmt, execution_options={"populate_existing": True}).one()
    # Somebody was marked, so the class took place. This is the only signal the
    # system has that a scheduled session actually happened — see `mark_held`.
    mark_held(db, session)

    if payload.status == AttendanceStatus.excused:
        _handle_excused_makeup_credit(db, enrollment, payload.session_id)

    record_audit(
        db,
        current_user,
        "update" if before else "create",
        "attendance",
        record.id,
        before=before,
        after=snapshot(record),
    )
    db.commit()
    response.status_code = status.HTTP_200_OK if before else status.HTTP_201_CREATED
    return record


@router.post("/sessions/{session_id}/bulk", response_model=BulkAttendanceResponse)
def bulk_attendance(
    session_id: int,
    payload: BulkAttendanceRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(staff_only),
) -> BulkAttendanceResponse:
    """Pass attendance for multiple enrollments in a session atomically.

    Upserts each attendance mark, marks the session held, and records an audit log.
    """
    session = db.get(ClassSession, session_id)
    if session is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    if session.status == SessionStatus.cancelled:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "La clase fue cancelada; no se puede pasar lista sobre ella",
        )
    session_course_id = db.scalar(
        select(Schedule.course_id).where(Schedule.id == session.schedule_id)
    )
    if current_user.role == UserRole.teacher and not teacher_teaches_course(
        db, current_user.id, session_course_id
    ):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No enseñas este curso")

    if not payload.items:
        return BulkAttendanceResponse(
            session_id=session_id,
            total_processed=0,
            created_count=0,
            updated_count=0,
            records=[],
        )

    # Validate all enrollments belong to this course and are live
    enrollment_ids = [item.enrollment_id for item in payload.items]
    enrollments_by_id = {
        e.id: e
        for e in db.scalars(
            select(Enrollment).where(Enrollment.id.in_(enrollment_ids))
        ).all()
    }

    for item in payload.items:
        enr = enrollments_by_id.get(item.enrollment_id)
        if enr is None or enr.course_id != session_course_id:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"La matrícula #{item.enrollment_id} no pertenece al curso de esta sesión",
            )
        _ensure_enrollment_is_live(enr)

    # Check existing marks to track created vs updated
    existing_marks = {
        a.enrollment_id: a
        for a in db.scalars(
            select(Attendance).where(
                Attendance.session_id == session_id,
                Attendance.enrollment_id.in_(enrollment_ids),
            )
        ).all()
    }

    created_count = 0
    updated_count = 0
    records: list[Attendance] = []

    for item in payload.items:
        existing = existing_marks.get(item.enrollment_id)
        if existing:
            updated_count += 1
            existing.status = item.status
            records.append(existing)
        else:
            created_count += 1
            stmt = (
                pg_insert(Attendance)
                .values(
                    enrollment_id=item.enrollment_id,
                    session_id=session_id,
                    status=item.status,
                )
                .on_conflict_do_update(
                    constraint="uq_attendance_enrollment_session",
                    set_={"status": item.status},
                )
                .returning(Attendance)
            )
            rec = db.scalars(stmt, execution_options={"populate_existing": True}).one()
            records.append(rec)

        enr = enrollments_by_id.get(item.enrollment_id)
        if enr:
            if item.status == AttendanceStatus.excused:
                _handle_excused_makeup_credit(db, enr, session_id)

    mark_held(db, session)
    record_audit(
        db,
        current_user,
        "bulk_update",
        "attendance",
        session_id,
        after={
            "session_id": session_id,
            "total_processed": len(payload.items),
            "created": created_count,
            "updated": updated_count,
        },
    )
    db.commit()
    for r in records:
        db.refresh(r)

    return BulkAttendanceResponse(
        session_id=session_id,
        total_processed=len(payload.items),
        created_count=created_count,
        updated_count=updated_count,
        records=records,
    )



@router.patch("/{attendance_id}", response_model=AttendanceRead)
def update_attendance(
    attendance_id: int,
    payload: AttendanceUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(staff_only),
) -> Attendance:
    record = db.get(Attendance, attendance_id)
    if record is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Attendance record not found")
    enrollment_in_scope_or_404(db, current_user, record.enrollment_id)
    _ensure_teacher_owns_enrollment(db, current_user, record.enrollment)
    before = snapshot(record)
    # Only the status is editable; the session a mark belongs to is fixed, so no
    # uniqueness collision is possible here.
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(record, field, value)
    record_audit(
        db, current_user, "update", "attendance", record.id, before, snapshot(record)
    )
    db.commit()
    db.refresh(record)
    return record


@router.delete("/{attendance_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_attendance(
    attendance_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(staff_only),
) -> None:
    record = db.get(Attendance, attendance_id)
    if record is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Attendance record not found")
    enrollment_in_scope_or_404(db, current_user, record.enrollment_id)
    _ensure_teacher_owns_enrollment(db, current_user, record.enrollment)
    record_audit(
        db, current_user, "delete", "attendance", record.id, before=snapshot(record)
    )
    db.delete(record)
    db.commit()
