"""A period report must describe its period.

Course-level grades (exams, finals) hang off no session, and so had no date at
all. Every one of them was folded into every report, meaning a *weekly* report's
average — and its "alumno en riesgo" verdict — carried exams sat months or years
earlier.
"""

from datetime import date, datetime, timedelta, timezone

from app.models import ClassSession, Grade
from app.services.reports import build_report
from tests.conftest import TODAY


def _grade(db, enrollment_id, name, score, *, when):
    grade = Grade(
        enrollment_id=enrollment_id,
        session_id=None,
        evaluation_name=name,
        score=score,
    )
    db.add(grade)
    db.flush()
    # server_default fills `created_at` on insert; back-date it to place the
    # exam outside the reported window.
    grade.created_at = when
    db.flush()
    return grade


def test_an_old_exam_does_not_count_towards_this_months_report(db, world):
    enrollment = world["enrollment"]
    today = TODAY

    _grade(
        db,
        enrollment.id,
        "Examen antiguo",
        1.0,
        when=datetime.now(timezone.utc) - timedelta(days=400),
    )

    report = build_report(db, world["admin"], "month", today)
    assert (
        report.grade_average is None
    ), "an exam from over a year ago must not appear in this month's report"

    _grade(db, enrollment.id, "Examen actual", 9.0, when=datetime.now(timezone.utc))
    current = build_report(db, world["admin"], "month", today)
    assert current.grade_average == 9.0


def test_the_headline_average_counts_the_same_grades_as_the_risk_rule(db, world):
    """A failing exam must move the number the report leads with."""
    enrollment = world["enrollment"]
    schedule = world["schedule_a"]
    today = TODAY

    session = ClassSession(schedule_id=schedule.id, date=today)
    db.add(session)
    db.flush()
    db.add(
        Grade(
            enrollment_id=enrollment.id,
            session_id=session.id,
            evaluation_name="Participación",
            score=10.0,
        )
    )
    db.flush()

    _grade(db, enrollment.id, "Examen final", 2.0, when=datetime.now(timezone.utc))

    report = build_report(db, world["admin"], "day", today)
    assert report.grades_recorded == 2
    assert report.grade_average == 6.0
