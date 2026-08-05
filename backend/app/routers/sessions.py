from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import Select, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import (
    apply_tenant,
    get_current_user,
    in_tenant,
    is_admin,
    require_staff_permission,
    student_course_ids,
    teacher_course_ids,
    teacher_teaches_course,
)
from app.models import (
    ClassSession,
    Course,
    ENROLLMENT_HAS_ACCESS,
    Enrollment,
    Permission,
    Schedule,
    SessionStatus,
    User,
    UserRole,
)
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
    close_register,
    ensure_session,
    generate_sessions,
    reopen_register,
    reschedule_session,
    roster_coverage,
)

router = APIRouter(prefix="/sessions", tags=["sessions"])

staff_only = require_staff_permission(Permission.manage_schedules)


# ---------------- Visibility ----------------
# A session inherits its course from the schedule, so it follows the same
# academic-relationship rule as meetings: staff see the sessions of the courses
# they run, a student sees the sessions of the courses they are enrolled in.
def _visible_sessions(db: Session, user: User) -> Select:
    # A session reaches its academy through schedule → course, which also caps
    # what an admin can see: the whole school, never the whole installation.
    stmt = apply_tenant(
        select(ClassSession)
        .join(Schedule)
        .join(Course, Schedule.course_id == Course.id),
        Course.tenant_id,
        user,
    )
    if is_admin(user):
        return stmt
    if user.role == UserRole.teacher:
        return stmt.where(
            Schedule.course_id.in_(teacher_course_ids(db, user.id) or [-1])
        )
    return stmt.where(Schedule.course_id.in_(student_course_ids(db, user.id) or [-1]))


def _owned_schedule_or_404(db: Session, user: User, schedule_id: int) -> Schedule:
    """A schedule the caller may act on, or 404 (never confirm it exists).

    Writing a franja — generarla, cancelarla, reprogramarla — es del profesor
    titular, no de todo el que imparte el curso: cancelar la clase de un colega
    no es lo mismo que calificar en ella.

    Pero la negativa tiene dos públicos distintos. Un profesor asignado al curso
    ya sabe que la franja existe: la ve en su lista de sesiones y califica sobre
    ella, así que un 404 mudo sólo se lee como un fallo del sistema. Uno que no
    está asignado no debe enterarse de nada, y sigue recibiendo 404.
    """
    schedule = db.get(Schedule, schedule_id)
    if schedule is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Schedule not found")
    if not in_tenant(user, db.get(Course, schedule.course_id)):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Schedule not found")
    if user.role == UserRole.teacher and schedule.teacher_id != user.id:
        if teacher_teaches_course(db, user.id, schedule.course_id):
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                (
                    "No eres el profesor titular de esta franja; sólo quien la "
                    "imparte puede generar, cancelar o reprogramar sus sesiones."
                ),
            )
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
                Enrollment.status.in_(ENROLLMENT_HAS_ACCESS),
                Enrollment.attendance_blocked.is_(True),
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


@router.post("/ensure", response_model=ClassSessionRead, status_code=status.HTTP_200_OK)
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


from app.services.audit import record, snapshot


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
    before = snapshot(session)
    cancel_session(db, session, payload.reason)
    record(
        db,
        current_user,
        "cancel",
        "class_session",
        session.id,
        before=before,
        after=snapshot(session),
    )
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
    before = snapshot(session)
    try:
        makeup = reschedule_session(db, session, payload.new_date)
    except ValueError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc))
    record(
        db,
        current_user,
        "reschedule",
        "class_session",
        session.id,
        before=before,
        after=snapshot(makeup),
    )
    notify_session_cancelled(db, session, rescheduled_to=payload.new_date.isoformat())
    db.commit()
    db.refresh(makeup)
    return makeup


@router.post("/{session_id}/close-register", response_model=ClassSessionRead)
def close_session_register(
    session_id: int,
    force: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(staff_only),
) -> ClassSession:
    """Dar la lista de una sesión por terminada.

    Exige que todos los que ocupan plaza tengan marca: una lista a medias no es
    una lista cerrada, y ese era justamente el hueco — `status = held` lo
    escribía el primer marcaje, así que 3 de 30 ya contaba como registrada.

    `?force=true` la cierra igualmente, para el caso real de un alumno que no
    aparece ni aparecerá y a quien el profesor no quiere marcar. La cifra de
    cobertura viaja en el error para que la interfaz pueda decir cuántos faltan.
    """
    session = db.get(ClassSession, session_id)
    if session is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    _owned_schedule_or_404(db, current_user, session.schedule_id)
    if session.status == SessionStatus.cancelled:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "La clase fue cancelada; no hay lista que cerrar",
        )

    marked, total = roster_coverage(db, session)
    if not force and marked < total:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            {
                "message": (
                    f"Faltan {total - marked} de {total} alumnos por marcar."
                ),
                "reason": "incomplete_register",
                "marked": marked,
                "total": total,
            },
        )

    before = snapshot(session)
    close_register(db, session, current_user.id)
    record(
        db,
        current_user,
        "close_register",
        "class_session",
        session.id,
        before=before,
        after=snapshot(session),
    )
    db.commit()
    db.refresh(session)
    return session


@router.post("/{session_id}/reopen-register", response_model=ClassSessionRead)
def reopen_session_register(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(staff_only),
) -> ClassSession:
    """Reabrir una lista cerrada para corregirla.

    Existe porque cerrar es un gesto humano y equivocarse en él también. Queda
    en la auditoría: una lista que se cierra, se reabre y se vuelve a cerrar es
    exactamente la clase de cambio que hay que poder explicar después.
    """
    session = db.get(ClassSession, session_id)
    if session is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    _owned_schedule_or_404(db, current_user, session.schedule_id)
    if session.register_closed_at is None:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Esta lista no está cerrada"
        )

    before = snapshot(session)
    reopen_register(db, session)
    record(
        db,
        current_user,
        "reopen_register",
        "class_session",
        session.id,
        before=before,
        after=snapshot(session),
    )
    db.commit()
    db.refresh(session)
    return session


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
    # This patch can set the very fields `cancel`/`reschedule` audit — status and
    # cancel_reason among them — so leaving it untraced was a way to change a
    # class's fate without appearing in the trail.
    before = snapshot(session)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(session, field, value)
    record(
        db,
        current_user,
        "update",
        "class_session",
        session.id,
        before=before,
        after=snapshot(session),
    )
    db.commit()
    db.refresh(session)
    return session
