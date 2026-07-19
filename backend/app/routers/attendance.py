from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import (
    get_current_user,
    require_role,
    teacher_course_ids,
    teacher_teaches_course,
)
from app.models import Attendance, ClassSession, Enrollment, Schedule, User, UserRole
from app.schemas.attendance import AttendanceCreate, AttendanceRead, AttendanceUpdate
from app.services.audit import record as record_audit
from app.services.audit import snapshot

router = APIRouter(prefix="/attendance", tags=["attendance"])

staff_only = require_role(UserRole.admin, UserRole.teacher)


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
    return session


@router.get("", response_model=list[AttendanceRead])
def list_attendance(
    enrollment_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[Attendance]:
    stmt = select(Attendance)
    if enrollment_id is not None:
        stmt = stmt.where(Attendance.enrollment_id == enrollment_id)
    # Students only see their own attendance.
    if current_user.role == UserRole.student:
        stmt = stmt.join(Enrollment).where(Enrollment.student_id == current_user.id)
    # Teachers only see attendance for their own courses.
    elif current_user.role == UserRole.teacher:
        course_ids = teacher_course_ids(db, current_user.id)
        stmt = stmt.join(Enrollment).where(Enrollment.course_id.in_(course_ids or [-1]))
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
    enrollment = db.get(Enrollment, payload.enrollment_id)
    if enrollment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Enrollment not found")
    _ensure_teacher_owns_enrollment(db, current_user, enrollment)
    _session_for_enrollment(db, payload.session_id, enrollment)

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
    record = db.scalars(
        stmt, execution_options={"populate_existing": True}
    ).one()
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
    response.status_code = (
        status.HTTP_200_OK if before else status.HTTP_201_CREATED
    )
    return record


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
    _ensure_teacher_owns_enrollment(db, current_user, record.enrollment)
    before = snapshot(record)
    # Only the status is editable; the session a mark belongs to is fixed, so no
    # uniqueness collision is possible here.
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(record, field, value)
    record_audit(db, current_user, "update", "attendance", record.id, before, snapshot(record))
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
    _ensure_teacher_owns_enrollment(db, current_user, record.enrollment)
    record_audit(db, current_user, "delete", "attendance", record.id, before=snapshot(record))
    db.delete(record)
    db.commit()
