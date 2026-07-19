"""Editing a course, and the rows that edit drags along with it.

A course owns two things other tables depend on: its term (copied onto every
schedule, where the exclusion constraint uses it) and its capacity (a promise to
the students already enrolled). Both can be edited into a state the rest of the
schema refuses, so both have to answer 409 rather than fall over.
"""

from datetime import date, time

import pytest
from sqlalchemy import select

from app.models import Course, CourseTeacher, Language, Level, Schedule, UserRole
from tests.conftest import auth, make_user


@pytest.fixture
def two_terms(db):
    """One teacher, one weekly slot, two courses whose terms do not overlap.

    Spring and Summer share "Monday 09:00" without clashing — that is exactly
    what the term-aware exclusion constraint is for.
    """
    teacher = make_user(db, "term_teacher@test.com", UserRole.teacher)
    admin = make_user(db, "term_admin@test.com", UserRole.admin)

    language = Language(name="Alemán")
    db.add(language)
    db.flush()
    level = Level(language_id=language.id, code="B1", name="B1")
    db.add(level)
    db.flush()

    spring = Course(
        level_id=level.id, name="Alemán primavera", max_students=10,
        start_date=date(2026, 1, 1), end_date=date(2026, 3, 31),
    )
    summer = Course(
        level_id=level.id, name="Alemán verano", max_students=10,
        start_date=date(2026, 7, 1), end_date=date(2026, 9, 30),
    )
    db.add_all([spring, summer])
    db.flush()

    for course in (spring, summer):
        db.add(CourseTeacher(course_id=course.id, teacher_id=teacher.id))
    db.flush()

    for course in (spring, summer):
        db.add(
            Schedule(
                course_id=course.id, teacher_id=teacher.id, day_of_week=0,
                start_time=time(9, 0), end_time=time(10, 0),
                term_start=course.start_date, term_end=course.end_date,
            )
        )
    db.flush()
    return {"admin": admin, "teacher": teacher, "spring": spring, "summer": summer}


def test_moving_a_course_onto_a_clashing_term_is_a_conflict(client, two_terms):
    """Dragging Summer back over Spring double-books the teacher on Mondays."""
    headers = auth(client, "term_admin@test.com")
    res = client.patch(
        f"/catalog/courses/{two_terms['summer'].id}",
        headers=headers,
        json={"start_date": "2026-02-01", "end_date": "2026-04-30"},
    )
    assert res.status_code == 409, "this used to escape as a 500"
    assert res.json()["detail"]["reason"] == "term_conflict"


def test_a_term_change_with_no_clash_still_works(client, two_terms, db):
    """The guard must not block ordinary edits: shift Summer, keep it disjoint."""
    headers = auth(client, "term_admin@test.com")
    res = client.patch(
        f"/catalog/courses/{two_terms['summer'].id}",
        headers=headers,
        json={"start_date": "2026-08-01", "end_date": "2026-10-31"},
    )
    assert res.status_code == 200, res.text

    # The denormalized term on the schedule follows the course.
    schedule = db.scalar(
        select(Schedule).where(Schedule.course_id == two_terms["summer"].id)
    )
    assert schedule.term_start == date(2026, 8, 1)
    assert schedule.term_end == date(2026, 10, 31)


# ---------------- Capacity ----------------
def test_capacity_cannot_drop_below_the_students_already_enrolled(client, world):
    headers = auth(client, "admin@test.com")
    res = client.patch(
        f"/catalog/courses/{world['course_a'].id}", headers=headers,
        json={"max_students": 0},
    )
    assert res.status_code == 409
    assert res.json()["detail"]["reason"] == "capacity_below_enrolled"


def test_capacity_may_drop_to_exactly_the_number_enrolled(client, world):
    """One enrolled student, cap of 1: full, but not a lie about who is in the room."""
    headers = auth(client, "admin@test.com")
    res = client.patch(
        f"/catalog/courses/{world['course_a'].id}", headers=headers,
        json={"max_students": 1},
    )
    assert res.status_code == 200, res.text


def test_capacity_may_always_grow(client, world):
    headers = auth(client, "admin@test.com")
    res = client.patch(
        f"/catalog/courses/{world['course_a'].id}", headers=headers,
        json={"max_students": 99},
    )
    assert res.status_code == 200


def test_a_cancelled_enrollment_does_not_hold_a_seat(client, world, db):
    """Capacity counts active enrollments, so cancelling frees the seat."""
    headers = auth(client, "admin@test.com")
    client.patch(
        f"/enrollments/{world['enrollment'].id}", headers=headers,
        json={"status": "cancelled"},
    )
    res = client.patch(
        f"/catalog/courses/{world['course_a'].id}", headers=headers,
        json={"max_students": 0},
    )
    assert res.status_code == 200, res.text


# ---------------- null is not "leave it alone" ----------------
def test_an_explicit_null_on_a_required_field_is_rejected_by_name(client, world):
    """`null` used to reach the column and come back as somebody else's error.

    A NOT NULL violation surfaces from the ORM unattributed, so it landed as
    whichever conflict the endpoint wrapped its commit in — a 409 blaming a
    schedule clash for a field that was simply blanked. Name it instead.
    """
    headers = auth(client, "admin@test.com")
    for field in ("max_students", "name", "level_id"):
        res = client.patch(
            f"/catalog/courses/{world['course_a'].id}", headers=headers,
            json={field: None},
        )
        assert res.status_code == 422, f"{field}=null should be rejected"
        assert field in res.text


def test_a_nullable_field_still_accepts_null(client, world):
    """An open-ended term is a real thing to ask for; do not over-reject."""
    headers = auth(client, "admin@test.com")
    res = client.patch(
        f"/catalog/courses/{world['course_a'].id}", headers=headers,
        json={"end_date": None},
    )
    assert res.status_code == 200, res.text
    assert res.json()["end_date"] is None


def test_omitting_a_field_still_leaves_it_alone(client, world):
    headers = auth(client, "admin@test.com")
    before = client.get("/catalog/courses", headers=headers).json()
    original = next(c for c in before if c["id"] == world["course_a"].id)
    res = client.patch(
        f"/catalog/courses/{world['course_a'].id}", headers=headers,
        json={"name": "Curso A renombrado"},
    )
    assert res.status_code == 200
    assert res.json()["max_students"] == original["max_students"]


# ---------------- Roster ----------------
def test_the_roster_drops_students_who_cancelled(client, world):
    """A cancelled student is not in the room to be marked or graded."""
    headers = auth(client, "admin@test.com")
    course_id = world["course_a"].id
    assert len(client.get(f"/catalog/courses/{course_id}/students", headers=headers).json()) == 1

    client.patch(
        f"/enrollments/{world['enrollment'].id}", headers=headers,
        json={"status": "cancelled"},
    )
    assert client.get(f"/catalog/courses/{course_id}/students", headers=headers).json() == []
