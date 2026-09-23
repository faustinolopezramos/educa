"""Turning a weekly `Schedule` into concrete `ClassSession` rows.

A schedule recurs every week on `day_of_week` within its term
(`term_start`..`term_end`). Generating sessions materializes one row per
matching date, which is what attendance, grades and reports hang off.

Python's `date.weekday()` is Monday=0..Sunday=6, the same convention the
schedule uses, so no remapping is needed.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.clock import academy_today
from app.models import (
    ENROLLMENT_OCCUPIES_SEAT,
    AcademicHoliday,
    Attendance,
    ClassSession,
    Course,
    Enrollment,
    Schedule,
    SessionStatus,
)
from app.services.scheduling import teacher_available


def _tenant_of(db: Session, schedule: Schedule | None) -> int | None:
    """Which academy a schedule belongs to, read through its course."""
    if schedule is None:
        return None
    return db.scalar(select(Course.tenant_id).where(Course.id == schedule.course_id))


def is_holiday(db: Session, on: date, tenant_id: int | None = None) -> bool:
    """Whether the academy is closed that day.

    Calendars are per-academy: one may close for a local feast the other works
    through, so a holiday only ever suppresses classes of its own tenant.
    """
    stmt = select(AcademicHoliday.id).where(AcademicHoliday.date == on)
    if tenant_id is not None:
        stmt = stmt.where(AcademicHoliday.tenant_id == tenant_id)
    return db.scalar(stmt) is not None


def _holidays_in(
    db: Session, start: date, end: date, tenant_id: int | None = None
) -> set[date]:
    stmt = select(AcademicHoliday.date).where(
        AcademicHoliday.date >= start, AcademicHoliday.date <= end
    )
    if tenant_id is not None:
        stmt = stmt.where(AcademicHoliday.tenant_id == tenant_id)
    return set(db.scalars(stmt).all())


def term_dates(schedule: Schedule) -> list[date]:
    """Every date the schedule runs on, within its term.

    An open term (no `term_start`/`term_end`) has no bounded set of dates, so
    bulk generation returns nothing and the caller must set the course dates.
    """
    if schedule.term_start is None or schedule.term_end is None:
        return []
    offset = (schedule.day_of_week - schedule.term_start.weekday()) % 7
    d = schedule.term_start + timedelta(days=offset)
    out: list[date] = []
    while d <= schedule.term_end:
        out.append(d)
        d += timedelta(days=7)
    return out


def generate_sessions(db: Session, schedule: Schedule) -> list[ClassSession]:
    """Create the missing sessions for a schedule's whole term (idempotent).

    Skips academic holidays — a class is never materialized on a day the academy
    is closed.
    """
    dates = term_dates(schedule)
    if not dates:
        return []
    existing = set(
        db.scalars(
            select(ClassSession.date).where(ClassSession.schedule_id == schedule.id)
        ).all()
    )
    holidays = _holidays_in(db, dates[0], dates[-1], _tenant_of(db, schedule))
    created: list[ClassSession] = []
    for d in dates:
        if d not in existing and d not in holidays:
            session = ClassSession(
                schedule_id=schedule.id,
                date=d,
                teacher_id=schedule.teacher_id,
                room_id=schedule.room_id,
                start_time=schedule.start_time,
                end_time=schedule.end_time,
            )
            db.add(session)
            created.append(session)
    if created:
        db.flush()
    return created


def ensure_session(db: Session, schedule: Schedule, on: date) -> ClassSession:
    """Get — or create — the session of a schedule on a specific date.

    Used when a teacher takes attendance for "today" without having generated
    the term in advance. The date must fall on the schedule's weekday and not be
    a holiday.
    """
    if on.weekday() != schedule.day_of_week:
        raise ValueError("La fecha no coincide con el día de la clase")
    if is_holiday(db, on, _tenant_of(db, schedule)):
        raise ValueError("Ese día es festivo; no hay clase")
    session = db.scalar(
        select(ClassSession).where(
            ClassSession.schedule_id == schedule.id, ClassSession.date == on
        )
    )
    if session is None:
        session = ClassSession(
            schedule_id=schedule.id,
            date=on,
            teacher_id=schedule.teacher_id,
            room_id=schedule.room_id,
            start_time=schedule.start_time,
            end_time=schedule.end_time,
        )
        db.add(session)
        db.flush()
    return session


def mark_held(db: Session, session: ClassSession) -> ClassSession:
    """Record that a class actually took place.

    `SessionStatus.held` existed from the start but nothing ever wrote it, so
    reports fell back to `realizadas = total − canceladas` and a class still
    three days away already counted as taught. Taking attendance is the signal
    that a class happened — it is the one action nobody performs for a class
    that did not.

    A cancelled session is left alone: reviving it is `PATCH /sessions/{id}`,
    an explicit decision, not a side effect of a mark being corrected.
    """
    if session.status == SessionStatus.scheduled:
        session.status = SessionStatus.held
        db.flush()
    return session


def session_course_id(db: Session, session: ClassSession) -> int | None:
    """El curso al que pertenece una sesión, a través de su horario.

    Una sesión no lleva `course_id` propio, así que la pregunta "¿esta sesión es
    de este curso?" siempre da este rodeo. Tenerla en un sitio evita que cada
    router lo resuelva a su manera — o que se olvide de preguntarlo.
    """
    return db.scalar(select(Schedule.course_id).where(Schedule.id == session.schedule_id))


def roster_coverage(db: Session, session: ClassSession) -> tuple[int, int]:
    """`(marcados, total)` de la lista de una sesión.

    El total son las matrículas que ocupan plaza en el curso de la sesión — la
    misma respuesta que da el roster del profesor, para que la barra de progreso
    y la validación del cierre no puedan discrepar.
    """
    course_id = db.scalar(
        select(Schedule.course_id).where(Schedule.id == session.schedule_id)
    )
    if course_id is None:
        return 0, 0
    seat_holders = list(
        db.scalars(
            select(Enrollment.id).where(
                Enrollment.course_id == course_id,
                Enrollment.status.in_(ENROLLMENT_OCCUPIES_SEAT),
            )
        ).all()
    )
    if not seat_holders:
        return 0, 0
    marked = (
        db.scalar(
            select(func.count(Attendance.id)).where(
                Attendance.session_id == session.id,
                Attendance.enrollment_id.in_(seat_holders),
            )
        )
        or 0
    )
    return marked, len(seat_holders)


def close_register(
    db: Session, session: ClassSession, actor_id: int
) -> ClassSession:
    """Dar la lista por terminada. No hace commit — lo lleva quien llama.

    Cerrar es también afirmar que la clase se dio, así que arrastra el `held`:
    de otro modo una sesión podría quedar registrada y a la vez sin ocurrir.
    """
    session.register_closed_at = datetime.now(timezone.utc)
    session.register_closed_by = actor_id
    mark_held(db, session)
    db.flush()
    return session


def reopen_register(db: Session, session: ClassSession) -> ClassSession:
    """Volver a abrir una lista cerrada, para corregirla.

    Deja `status` como está: la clase ocurrió igualmente, y lo que se reabre es
    el registro, no el hecho.
    """
    session.register_closed_at = None
    session.register_closed_by = None
    db.flush()
    return session


def cancel_session(
    db: Session, session: ClassSession, reason: str | None
) -> ClassSession:
    """Mark a session as not held. Idempotent-ish: re-cancelling just updates
    the reason. Its attendance/grades stay for the record but the session no
    longer counts as a class that took place."""
    session.status = SessionStatus.cancelled
    session.cancel_reason = reason
    db.flush()
    return session


def reschedule_session(
    db: Session, session: ClassSession, new_date: date
) -> ClassSession:
    """Cancel a session and create a make-up on another date, linked back.

    A make-up may fall on any weekday (it is a special class), but not on a
    holiday nor on a date the schedule already has a session.
    """
    if new_date < academy_today():
        raise ValueError("No se puede reprogramar a una fecha pasada")
    schedule = db.get(Schedule, session.schedule_id)
    if is_holiday(db, new_date, _tenant_of(db, schedule)):
        raise ValueError("La nueva fecha es festivo")
    clash = db.scalar(
        select(ClassSession).where(
            ClassSession.schedule_id == session.schedule_id,
            ClassSession.date == new_date,
        )
    )
    if clash is not None:
        raise ValueError("Ya existe una sesión de este horario en esa fecha")

    if schedule:
        if schedule.teacher_id:
            # 1. Validate that the teacher is available on the new weekday/time
            if not teacher_available(
                db,
                schedule.teacher_id,
                new_date.weekday(),
                schedule.start_time,
                schedule.end_time,
            ):
                raise ValueError(
                    "Conflicto de horario detectado: el profesor no tiene disponibilidad en ese horario en esa fecha"
                )

            # 2. Validate that no other weekly schedule of the teacher clashes
            teacher_conflict = db.scalar(
                select(Schedule.id).where(
                    Schedule.teacher_id == schedule.teacher_id,
                    Schedule.id != schedule.id,
                    Schedule.day_of_week == new_date.weekday(),
                    Schedule.start_time < schedule.end_time,
                    Schedule.end_time > schedule.start_time,
                    (Schedule.term_start.is_(None) | (Schedule.term_start <= new_date)),
                    (Schedule.term_end.is_(None) | (Schedule.term_end >= new_date)),
                )
            )
            if teacher_conflict:
                raise ValueError(
                    "Conflicto de horario detectado: el profesor ya tiene otra clase en ese horario en esa fecha"
                )

        if schedule.room_id:
            room_conflict = db.scalar(
                select(Schedule.id).where(
                    Schedule.room_id == schedule.room_id,
                    Schedule.id != schedule.id,
                    Schedule.day_of_week == new_date.weekday(),
                    Schedule.start_time < schedule.end_time,
                    Schedule.end_time > schedule.start_time,
                    (Schedule.term_start.is_(None) | (Schedule.term_start <= new_date)),
                    (Schedule.term_end.is_(None) | (Schedule.term_end >= new_date)),
                )
            )
            if room_conflict:
                raise ValueError("El aula ya está ocupada en ese horario en esa fecha")

        # The checks above only compare against *weekly patterns* landing on that
        # weekday. A make-up is by definition off-pattern — it can sit on any day
        # — so two make-ups could be dropped onto the same teacher or room at the
        # same hour without either one noticing the other. This compares against
        # the concrete sessions already standing on that date.
        same_day = db.scalars(
            select(ClassSession)
            .join(Schedule, ClassSession.schedule_id == Schedule.id)
            .where(
                ClassSession.date == new_date,
                ClassSession.schedule_id != schedule.id,
                ClassSession.status != SessionStatus.cancelled,
                Schedule.start_time < schedule.end_time,
                Schedule.end_time > schedule.start_time,
            )
        ).all()
        for other in same_day:
            other_schedule = db.get(Schedule, other.schedule_id)
            if other_schedule is None:
                continue
            if schedule.teacher_id and other_schedule.teacher_id == schedule.teacher_id:
                raise ValueError(
                    "Conflicto de horario detectado: el profesor ya tiene otra clase en ese horario en esa fecha"
                )
            if schedule.room_id and other_schedule.room_id == schedule.room_id:
                raise ValueError("El aula ya está ocupada en ese horario en esa fecha")

    session.status = SessionStatus.cancelled
    session.cancel_reason = f"Reprogramada al {new_date.isoformat()}"
    makeup = ClassSession(
        schedule_id=session.schedule_id,
        date=new_date,
        origin_session_id=session.id,
        teacher_id=session.teacher_id,
        room_id=session.room_id,
        start_time=session.start_time,
        end_time=session.end_time,
    )
    db.add(makeup)
    db.flush()
    return makeup
