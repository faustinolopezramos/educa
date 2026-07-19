from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import Select, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import (
    get_current_user,
    require_role,
    student_course_ids,
    teacher_course_ids,
)
from app.models import ClassSession, Enrollment, EnrollmentStatus, Schedule, User, UserRole
from app.schemas.session import (
    ClassSessionRead,
    SessionCancel,
    SessionEnsure,
    SessionGenerate,
    SessionReschedule,
    SessionUpdate,
)
from app.services.notifications import notify_session_cancelled
from app.services.sessions import (
    cancel_session,
    ensure_session,
    generate_sessions,
    reschedule_session,
)

router = APIRouter(prefix="/sessions", tags=["sessions"])

staff_only = require_role(UserRole.admin, UserRole.teacher)


# ---------------- Visibility ----------------
# A session inherits its course from the schedule, so it follows the same
# academic-relationship rule as meetings: staff see the sessions of the courses
# they run, a student sees the sessions of the courses they are enrolled in.
def _visible_sessions(db: Session, user: User) -> Select:
    stmt = select(ClassSession).join(Schedule)
    if user.role == UserRole.admin:
        return stmt
    if user.role == UserRole.teacher:
        return stmt.where(Schedule.course_id.in_(teacher_course_ids(db, user.id) or [-1]))
    return stmt.where(Schedule.course_id.in_(student_course_ids(db, user.id) or [-1]))


def _owned_schedule_or_404(db: Session, user: User, schedule_id: int) -> Schedule:
    """A schedule the caller is staff for, or 404 (never confirm it exists)."""
    schedule = db.get(Schedule, schedule_id)
    if schedule is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Schedule not found")
    if user.role == UserRole.teacher and schedule.teacher_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Schedule not found")
    return schedule


@router.get("", response_model=list[ClassSessionRead])
def list_sessions(
    schedule_id: int | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[ClassSession]:
    stmt = _visible_sessions(db, current_user)
    if schedule_id is not None:
        stmt = stmt.where(ClassSession.schedule_id == schedule_id)
    if date_from is not None:
        stmt = stmt.where(ClassSession.date >= date_from)
    if date_to is not None:
        stmt = stmt.where(ClassSession.date <= date_to)
    return list(db.scalars(stmt.order_by(ClassSession.date)).all())


@router.get("/{session_id}", response_model=ClassSessionRead)
def get_session(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ClassSession:
    """One session the caller may see, or 404 (never confirm one they can't)."""
    session = db.scalar(
        _visible_sessions(db, current_user).where(ClassSession.id == session_id)
    )
    if session is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    if current_user.role == UserRole.student:
        sched = db.get(Schedule, session.schedule_id)
        blocked = sched is not None and db.scalar(
            select(Enrollment.id).where(
                Enrollment.student_id == current_user.id,
                Enrollment.course_id == sched.course_id,
                Enrollment.status == EnrollmentStatus.active,
                Enrollment.attendance_blocked == True,
            )
        )
        if blocked:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                "Tu acceso a clases está restringido. Contacta a administración.",
            )
    return session


@router.post("/generate", response_model=list[ClassSessionRead])
def generate(
    payload: SessionGenerate,
    db: Session = Depends(get_db),
    current_user: User = Depends(staff_only),
) -> list[ClassSession]:
    """Materialize every session of a schedule's term (idempotent)."""
    schedule = _owned_schedule_or_404(db, current_user, payload.schedule_id)
    if schedule.term_start is None or schedule.term_end is None:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "El curso no tiene fechas de inicio/fin; no se pueden generar sesiones",
        )
    created = generate_sessions(db, schedule)
    db.commit()
    return created


@router.post(
    "/ensure", response_model=ClassSessionRead, status_code=status.HTTP_200_OK
)
def ensure(
    payload: SessionEnsure,
    db: Session = Depends(get_db),
    current_user: User = Depends(staff_only),
) -> ClassSession:
    """Get-or-create one session, e.g. the class of today, before marking it."""
    schedule = _owned_schedule_or_404(db, current_user, payload.schedule_id)
    try:
        session = ensure_session(db, schedule, payload.date)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc))
    db.commit()
    return session


@router.post("/{session_id}/cancel", response_model=ClassSessionRead)
def cancel(
    session_id: int,
    payload: SessionCancel,
    db: Session = Depends(get_db),
    current_user: User = Depends(staff_only),
) -> ClassSession:
    """Mark a class as not held (holiday, absence…). Keeps the row for the record."""
    session = db.get(ClassSession, session_id)
    if session is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    _owned_schedule_or_404(db, current_user, session.schedule_id)
    cancel_session(db, session, payload.reason)
    notify_session_cancelled(db, session)
    db.commit()
    db.refresh(session)
    return session


@router.post("/{session_id}/reschedule", response_model=ClassSessionRead)
def reschedule(
    session_id: int,
    payload: SessionReschedule,
    db: Session = Depends(get_db),
    current_user: User = Depends(staff_only),
) -> ClassSession:
    """Cancel this class and create a make-up on another date (returns the make-up)."""
    session = db.get(ClassSession, session_id)
    if session is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    _owned_schedule_or_404(db, current_user, session.schedule_id)
    try:
        makeup = reschedule_session(db, session, payload.new_date)
    except ValueError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc))
    notify_session_cancelled(db, session, rescheduled_to=payload.new_date.isoformat())
    db.commit()
    db.refresh(makeup)
    return makeup


@router.patch("/{session_id}", response_model=ClassSessionRead)
def update_session(
    session_id: int,
    payload: SessionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(staff_only),
) -> ClassSession:
    session = db.get(ClassSession, session_id)
    if session is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    _owned_schedule_or_404(db, current_user, session.schedule_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(session, field, value)
    db.commit()
    db.refresh(session)
    return session
