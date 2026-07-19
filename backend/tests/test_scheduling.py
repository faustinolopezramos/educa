"""Scheduling-conflict logic.

Most of this is pure and needs no database; the weekly-load cap is the
exception, since it has to read the teacher's other classes to add them up.
"""

from datetime import date, time

import pytest

from app.models import Course, CourseTeacher, Language, Level, Schedule, UserRole
from app.services.scheduling import (
    intervals_overlap,
    teacher_exceeds_load,
    teacher_weekly_minutes,
    terms_overlap,
)
from tests.conftest import make_user


def t(h: int, m: int = 0) -> time:
    return time(h, m)


SPRING = (date(2026, 1, 1), date(2026, 3, 31))
SUMMER = (date(2026, 6, 1), date(2026, 8, 31))
STRADDLE = (date(2026, 2, 1), date(2026, 5, 1))


# ---- time overlap (same weekly convention) ----
def test_same_day_overlap():
    assert intervals_overlap(0, t(9), t(11), 0, t(10), t(12)) is True


def test_touching_edges_do_not_overlap():
    assert intervals_overlap(0, t(9), t(10), 0, t(10), t(11)) is False


def test_different_day_never_overlaps():
    assert intervals_overlap(0, t(9), t(11), 1, t(9), t(11)) is False


# ---- term awareness (the false-positive fix) ----
def test_same_slot_disjoint_terms_no_conflict():
    assert intervals_overlap(0, t(10), t(11), 0, t(10), t(11), SPRING, SUMMER) is False


def test_same_slot_overlapping_terms_conflict():
    assert intervals_overlap(0, t(10), t(11), 0, t(10), t(11), SPRING, STRADDLE) is True


def test_none_term_is_unbounded():
    assert (
        intervals_overlap(0, t(10), t(11), 0, t(10), t(11), (None, None), SUMMER)
        is True
    )


# ---- terms_overlap directly ----
def test_terms_disjoint():
    assert terms_overlap(*SPRING, *SUMMER) is False


def test_terms_adjacent_inclusive():
    assert (
        terms_overlap(
            date(2026, 1, 1), date(2026, 3, 31), date(2026, 3, 31), date(2026, 4, 1)
        )
        is True
    )


def test_open_end_overlaps():
    assert (
        terms_overlap(date(2026, 1, 1), None, date(2027, 1, 1), date(2027, 2, 1))
        is True
    )


# ---- weekly load cap (needs the teacher's other classes, so: DB) ----
@pytest.fixture
def loaded_teacher(db):
    """A teacher capped at 5h/week who already teaches 4h every Spring week."""
    teacher = make_user(db, "load@test.com", UserRole.teacher)
    teacher.max_weekly_hours = 5

    language = Language(name="Italiano")
    db.add(language)
    db.flush()
    level = Level(language_id=language.id, code="A2", name="A2")
    db.add(level)
    db.flush()
    course = Course(
        level_id=level.id, name="Italiano primavera", max_students=10,
        start_date=SPRING[0], end_date=SPRING[1],
    )
    db.add(course)
    db.flush()
    db.add(CourseTeacher(course_id=course.id, teacher_id=teacher.id))
    db.flush()
    # 4 hours a week, spread over two days so nothing self-overlaps.
    for day in (0, 1):
        db.add(
            Schedule(
                course_id=course.id, teacher_id=teacher.id, day_of_week=day,
                start_time=t(9), end_time=t(11),
                term_start=SPRING[0], term_end=SPRING[1],
            )
        )
    db.flush()
    return teacher


def test_load_counts_classes_running_in_the_same_term(db, loaded_teacher):
    assert teacher_weekly_minutes(db, loaded_teacher.id, *SPRING) == 240


def test_load_ignores_classes_from_a_term_that_never_overlaps(db, loaded_teacher):
    """A Spring class and a Summer class never share a week, so they never add up."""
    assert teacher_weekly_minutes(db, loaded_teacher.id, *SUMMER) == 0


def test_a_summer_block_does_not_inherit_the_spring_load(db, loaded_teacher):
    """The bug this pins: 4h of Spring made every Summer hour look over-cap."""
    assert (
        teacher_exceeds_load(db, loaded_teacher.id, t(9), t(13), *SUMMER) is False
    ), "4h in Summer is under the 5h cap on its own"


def test_the_cap_still_bites_within_one_term(db, loaded_teacher):
    # 4h already booked in Spring + 2h more = 6h > the 5h cap.
    assert teacher_exceeds_load(db, loaded_teacher.id, t(15), t(17), *SPRING) is True


def test_a_block_that_fits_under_the_cap_is_allowed(db, loaded_teacher):
    # 4h + 1h = 5h, exactly the cap.
    assert teacher_exceeds_load(db, loaded_teacher.id, t(15), t(16), *SPRING) is False


def test_an_uncapped_teacher_never_exceeds(db, loaded_teacher):
    loaded_teacher.max_weekly_hours = None
    db.flush()
    assert teacher_exceeds_load(db, loaded_teacher.id, t(8), t(20), *SPRING) is False
