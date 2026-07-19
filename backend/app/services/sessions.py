"""Turning a weekly `Schedule` into concrete `ClassSession` rows.

A schedule recurs every week on `day_of_week` within its term
(`term_start`..`term_end`). Generating sessions materializes one row per
matching date, which is what attendance, grades and reports hang off.

Python's `date.weekday()` is Monday=0..Sunday=6, the same convention the
schedule uses, so no remapping is needed.
"""

from __future__ import annotations

from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AcademicHoliday, ClassSession, SessionStatus, Schedule


def is_holiday(db: Session, on: date) -> bool:
    return db.scalar(select(AcademicHoliday.id).where(AcademicHoliday.date == on)) is not None


def _holidays_in(db: Session, start: date, end: date) -> set[date]:
    return set(
        db.scalars(
            select(AcademicHoliday.date).where(
                AcademicHoliday.date >= start, AcademicHoliday.date <= end
            )
        ).all()
    )


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
            select(ClassSession.date).where(
                ClassSession.schedule_id == schedule.id
            )
        ).all()
    )
    holidays = _holidays_in(db, dates[0], dates[-1])
    created: list[ClassSession] = []
    for d in dates:
        if d not in existing and d not in holidays:
            session = ClassSession(schedule_id=schedule.id, date=d)
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
    if is_holiday(db, on):
        raise ValueError("Ese día es festivo; no hay clase")
    session = db.scalar(
        select(ClassSession).where(
            ClassSession.schedule_id == schedule.id, ClassSession.date == on
        )
    )
    if session is None:
        session = ClassSession(schedule_id=schedule.id, date=on)
        db.add(session)
        db.flush()
    return session


def cancel_session(db: Session, session: ClassSession, reason: str | None) -> ClassSession:
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
    if is_holiday(db, new_date):
        raise ValueError("La nueva fecha es festivo")
    clash = db.scalar(
        select(ClassSession).where(
            ClassSession.schedule_id == session.schedule_id,
            ClassSession.date == new_date,
        )
    )
    if clash is not None:
        raise ValueError("Ya existe una sesión de este horario en esa fecha")
    session.status = SessionStatus.cancelled
    session.cancel_reason = f"Reprogramada al {new_date.isoformat()}"
    makeup = ClassSession(
        schedule_id=session.schedule_id,
        date=new_date,
        origin_session_id=session.id,
    )
    db.add(makeup)
    db.flush()
    return makeup
