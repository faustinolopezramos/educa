"""Rescheduling must not create a silent double-booking.

The clash check only compared the new date against other schedules' *weekly
patterns*. A make-up is off-pattern by definition — it can land on any weekday —
so two make-ups could be dropped on the same teacher at the same hour and
neither would see the other. Rescheduling into the past was not refused either.
"""

from datetime import date, time, timedelta

import pytest

from app.models import ClassSession, Course, CourseTeacher, Schedule
from app.services.sessions import reschedule_session


def _next_weekday(day_of_week: int, weeks_ahead: int = 2) -> date:
    d = date.today() + timedelta(weeks=weeks_ahead)
    while d.weekday() != day_of_week:
        d += timedelta(days=1)
    return d


def test_rescheduling_into_the_past_is_refused(db, world):
    session = ClassSession(schedule_id=world["schedule_a"].id, date=_next_weekday(0))
    db.add(session)
    db.flush()

    with pytest.raises(ValueError, match="fecha pasada"):
        reschedule_session(db, session, date.today() - timedelta(days=1))


def test_two_makeups_cannot_double_book_the_same_teacher(db, world):
    """Both schedules belong to teacher_a and overlap in time.

    Their weekly patterns fall on different weekdays, so the pattern-based check
    sees nothing: only the concrete session already standing on that date does.
    """
    teacher = world["teacher_a"]
    course_b = world["course_b"]
    db.add(CourseTeacher(course_id=course_b.id, teacher_id=teacher.id))
    db.flush()

    course_a = world["course_a"]
    other = Schedule(
        course_id=course_b.id,
        teacher_id=teacher.id,
        day_of_week=2,
        start_time=world["schedule_a"].start_time,
        end_time=world["schedule_a"].end_time,
        term_start=course_a.start_date,
        term_end=course_a.end_date,
    )
    db.add(other)
    db.flush()

    target = _next_weekday(4)
    # The other schedule already holds a make-up that day, at the same hour.
    db.add(ClassSession(schedule_id=other.id, date=target))
    session = ClassSession(schedule_id=world["schedule_a"].id, date=_next_weekday(0))
    db.add(session)
    db.flush()

    with pytest.raises(ValueError, match="profesor"):
        reschedule_session(db, session, target)


def test_a_free_date_still_reschedules(db, world):
    session = ClassSession(schedule_id=world["schedule_a"].id, date=_next_weekday(0))
    db.add(session)
    db.flush()

    makeup = reschedule_session(db, session, _next_weekday(4))

    assert makeup.origin_session_id == session.id
    assert session.status.value == "cancelled"
