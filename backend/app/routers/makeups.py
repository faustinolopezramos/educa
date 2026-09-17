from __future__ import annotations

from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.clock import academy_today
from app.core.database import get_db
from app.core.deps import (
    apply_tenant,
    get_current_user,
    has_user_permission,
    is_admin,
    require_staff_permission,
    student_course_ids,
    teacher_course_ids,
)
from app.models import (
    ClassSession,
    Course,
    ENROLLMENT_OCCUPIES_SEAT,
    Enrollment,
    Level,
    MakeUpCredit,
    MakeUpStatus,
    Permission,
    Room,
    Schedule,
    SessionStatus,
    User,
    UserRole,
)
from app.schemas.makeup import (
    CandidateSessionRead,
    MakeUpBookRequest,
    MakeUpCreditCreate,
    MakeUpCreditRead,
)
from app.services.audit import record as record_audit, snapshot

router = APIRouter(prefix="/makeups", tags=["makeups"])

staff_or_admin = require_staff_permission(Permission.manage_enrollments)


def _enrich_credit(db: Session, credit: MakeUpCredit) -> MakeUpCreditRead:
    enrollment = db.get(Enrollment, credit.enrollment_id)
    student = db.get(User, credit.student_id)
    course = db.get(Course, enrollment.course_id) if enrollment else None
    level = db.get(Level, course.level_id) if course else None

    origin_sess = db.get(ClassSession, credit.origin_session_id) if credit.origin_session_id else None
    target_sess = db.get(ClassSession, credit.target_session_id) if credit.target_session_id else None

    target_course_name = None
    target_time_str = None
    if target_sess and target_sess.schedule:
        target_course = db.get(Course, target_sess.schedule.course_id)
        if target_course:
            target_course_name = target_course.name
        target_time_str = f"{target_sess.start_time.strftime('%H:%M')}–{target_sess.end_time.strftime('%H:%M')}"

    return MakeUpCreditRead(
        id=credit.id,
        student_id=credit.student_id,
        enrollment_id=credit.enrollment_id,
        origin_session_id=credit.origin_session_id,
        target_session_id=credit.target_session_id,
        status=credit.status,
        issued_at=credit.issued_at,
        expires_at=credit.expires_at,
        notes=credit.notes,
        student_name=student.full_name if student else None,
        course_name=course.name if course else None,
        level_name=level.name if level else None,
        origin_session_date=origin_sess.date if origin_sess else None,
        target_session_date=target_sess.date if target_sess else None,
        target_session_time=target_time_str,
        target_course_name=target_course_name,
    )


@router.get("", response_model=list[MakeUpCreditRead])
def list_makeups(
    student_id: int | None = None,
    status_filter: MakeUpStatus | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[MakeUpCreditRead]:
    stmt = select(MakeUpCredit).order_by(MakeUpCredit.issued_at.desc())

    if current_user.role == UserRole.student:
        stmt = stmt.where(MakeUpCredit.student_id == current_user.id)
    elif current_user.role == UserRole.teacher:
        course_ids = teacher_course_ids(db, current_user.id)
        stmt = (
            stmt.join(Enrollment, MakeUpCredit.enrollment_id == Enrollment.id)
            .where(Enrollment.course_id.in_(course_ids or [-1]))
        )
    else:
        # Admin / Assistant scoped by tenant
        stmt = apply_tenant(stmt, MakeUpCredit.tenant_id, current_user)

    if student_id is not None and (is_admin(current_user) or current_user.role in (UserRole.teacher, UserRole.assistant)):
        stmt = stmt.where(MakeUpCredit.student_id == student_id)
    if status_filter is not None:
        stmt = stmt.where(MakeUpCredit.status == status_filter)

    credits = db.scalars(stmt).all()
    return [_enrich_credit(db, c) for c in credits]


@router.post("", response_model=MakeUpCreditRead, status_code=status.HTTP_201_CREATED)
def create_makeup_credit(
    payload: MakeUpCreditCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(staff_or_admin),
) -> MakeUpCreditRead:
    enrollment = db.get(Enrollment, payload.enrollment_id)
    if enrollment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Enrollment not found")
    if enrollment.student_id != payload.student_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Enrollment does not belong to student")

    course = db.get(Course, enrollment.course_id)
    tenant_id = course.tenant_id if course else current_user.tenant_id

    expires = payload.expires_at or (academy_today() + timedelta(days=60))

    credit = MakeUpCredit(
        tenant_id=tenant_id,
        student_id=payload.student_id,
        enrollment_id=payload.enrollment_id,
        origin_session_id=payload.origin_session_id,
        expires_at=expires,
        notes=payload.notes,
        status=MakeUpStatus.available,
    )
    db.add(credit)
    db.flush()

    record_audit(db, current_user, "create", "make_up_credits", credit.id, after=snapshot(credit))
    db.commit()
    db.refresh(credit)
    return _enrich_credit(db, credit)


@router.get("/{credit_id}/candidates", response_model=list[CandidateSessionRead])
def get_candidate_sessions(
    credit_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[CandidateSessionRead]:
    credit = db.get(MakeUpCredit, credit_id)
    if credit is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Make-up credit not found")

    if current_user.role == UserRole.student and credit.student_id != current_user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your make-up credit")

    enrollment = db.get(Enrollment, credit.enrollment_id)
    if enrollment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Enrollment not found")
    source_course = db.get(Course, enrollment.course_id)
    if source_course is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Source course not found")

    level_id = source_course.level_id
    today = academy_today()

    # Find future sessions in courses of the exact same MCER level
    stmt = (
        select(ClassSession, Course, Schedule, User, Level)
        .join(Schedule, ClassSession.schedule_id == Schedule.id)
        .join(Course, Schedule.course_id == Course.id)
        .join(Level, Course.level_id == Level.id)
        .join(User, ClassSession.teacher_id == User.id)
        .where(
            Course.level_id == level_id,
            ClassSession.date >= today,
            ClassSession.status != SessionStatus.cancelled,
        )
        .order_by(ClassSession.date.asc(), ClassSession.start_time.asc())
    )
    stmt = apply_tenant(stmt, Course.tenant_id, current_user)
    rows = db.execute(stmt).all()

    candidates: list[CandidateSessionRead] = []
    for sess, course, sched, teacher, lvl in rows:
        if credit.origin_session_id and sess.id == credit.origin_session_id:
            continue

        # Count active enrollments in this course
        active_enrollments = db.scalar(
            select(func.count(Enrollment.id)).where(
                Enrollment.course_id == course.id,
                Enrollment.status.in_(ENROLLMENT_OCCUPIES_SEAT),
            )
        ) or 0

        # Count make-up bookings for this session
        booked_makeups = db.scalar(
            select(func.count(MakeUpCredit.id)).where(
                MakeUpCredit.target_session_id == sess.id,
                MakeUpCredit.status == MakeUpStatus.booked,
            )
        ) or 0

        occupied = active_enrollments + booked_makeups
        available = max(0, course.max_students - occupied)

        if available > 0:
            room = db.get(Room, sched.room_id) if sched.room_id else None
            candidates.append(
                CandidateSessionRead(
                    session_id=sess.id,
                    course_id=course.id,
                    course_name=course.name,
                    level_id=lvl.id,
                    level_name=lvl.name,
                    date=sess.date,
                    start_time=sess.start_time,
                    end_time=sess.end_time,
                    teacher_name=teacher.full_name,
                    modality=sched.modality,
                    room_name=room.name if room else None,
                    max_students=course.max_students,
                    occupied_seats=occupied,
                    available_seats=available,
                )
            )

    return candidates


@router.post("/{credit_id}/book", response_model=MakeUpCreditRead)
def book_candidate_session(
    credit_id: int,
    payload: MakeUpBookRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MakeUpCreditRead:
    credit = db.get(MakeUpCredit, credit_id)
    if credit is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Make-up credit not found")

    if current_user.role == UserRole.student and credit.student_id != current_user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your make-up credit")

    if credit.status not in (MakeUpStatus.available, MakeUpStatus.booked):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"El pase de recuperación no se puede reservar en estado '{credit.status.value}'",
        )

    target_session = db.get(ClassSession, payload.target_session_id)
    if target_session is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Target session not found")
    if target_session.status == SessionStatus.cancelled:
        raise HTTPException(status.HTTP_409_CONFLICT, "La sesión seleccionada fue cancelada")
    if target_session.date < academy_today():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No se puede reservar una sesión en el pasado")

    # Validate matching level
    enrollment = db.get(Enrollment, credit.enrollment_id)
    source_course = db.get(Course, enrollment.course_id) if enrollment else None
    target_course = db.get(Course, target_session.schedule.course_id) if target_session.schedule else None

    if not source_course or not target_course or source_course.level_id != target_course.level_id:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "La sesión destino debe pertenecer al mismo nivel pedagógico (MCER) del curso original",
        )

    # Validate capacity
    active_enrollments = db.scalar(
        select(func.count(Enrollment.id)).where(
            Enrollment.course_id == target_course.id,
            Enrollment.status.in_(ENROLLMENT_OCCUPIES_SEAT),
        )
    ) or 0

    booked_makeups = db.scalar(
        select(func.count(MakeUpCredit.id)).where(
            MakeUpCredit.target_session_id == target_session.id,
            MakeUpCredit.status == MakeUpStatus.booked,
            MakeUpCredit.id != credit.id,
        )
    ) or 0

    if active_enrollments + booked_makeups >= target_course.max_students:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Aforo completo: esta sesión ya alcanzó el número máximo de alumnos permitidos",
        )

    before = snapshot(credit)
    credit.target_session_id = target_session.id
    credit.status = MakeUpStatus.booked

    record_audit(db, current_user, "update", "make_up_credits", credit.id, before=before, after=snapshot(credit))
    db.commit()
    db.refresh(credit)
    return _enrich_credit(db, credit)


@router.post("/{credit_id}/cancel-booking", response_model=MakeUpCreditRead)
def cancel_makeup_booking(
    credit_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MakeUpCreditRead:
    credit = db.get(MakeUpCredit, credit_id)
    if credit is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Make-up credit not found")

    if current_user.role == UserRole.student and credit.student_id != current_user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your make-up credit")

    if credit.status != MakeUpStatus.booked:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "El crédito no tiene una reserva activa para cancelar",
        )

    before = snapshot(credit)
    credit.target_session_id = None
    credit.status = MakeUpStatus.available

    record_audit(db, current_user, "update", "make_up_credits", credit.id, before=before, after=snapshot(credit))
    db.commit()
    db.refresh(credit)
    return _enrich_credit(db, credit)
