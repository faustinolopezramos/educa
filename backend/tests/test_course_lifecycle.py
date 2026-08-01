"""The course lifecycle: which moves exist, and which ones are earned.

A course used to have no state at all. Whether it was still being set up,
taking enrolments, running or finished had to be guessed from `start_date` and
`end_date` — so a half-built course with no timetable and no teacher looked
exactly like one about to start, and an admin could seat students in it.

`COURSE_TRANSITIONS` says which moves exist; `services.courses.check_transition`
says which are earned. These pin both, and the enrolment gate that gives the
state its teeth.
"""

import pytest

from app.models import (
    Course,
    CourseStatus,
    CourseTeacher,
    Enrollment,
    EnrollmentStatus,
    course_transition_allowed,
)
from tests.conftest import auth


def _status(client, headers, course_id, target):
    return client.post(
        f"/catalog/courses/{course_id}/status", headers=headers, json={"status": target}
    )


@pytest.fixture
def ready_course(db, world):
    """`course_a` already has a teacher and a schedule, so it may open."""
    course = db.get(Course, world["course_a"].id)
    course.status = CourseStatus.draft
    db.flush()
    return course


# ---------------- The table ----------------
def test_the_transition_table_matches_the_documented_lifecycle():
    C = CourseStatus
    legal = [
        (C.draft, C.open),
        (C.draft, C.archived),
        (C.open, C.in_progress),
        (C.open, C.draft),
        (C.open, C.archived),
        (C.in_progress, C.closed),
        (C.closed, C.archived),
        (C.closed, C.in_progress),
    ]
    illegal = [
        (C.draft, C.in_progress),  # a course does not start before it opens
        (C.draft, C.closed),
        (C.in_progress, C.open),  # a running course does not go back on sale
        (C.in_progress, C.draft),
        (C.archived, C.open),  # archiving is the end of the line
        (C.archived, C.draft),
        (C.closed, C.open),
    ]
    for current, target in legal:
        assert course_transition_allowed(current, target), f"{current}→{target}"
    for current, target in illegal:
        assert not course_transition_allowed(current, target), f"{current}→{target}"
    for state in C:
        assert course_transition_allowed(state, state), f"{state} should stay put"


def test_an_illegal_move_is_refused_with_both_ends_named(client, db, world, ready_course):
    admin = auth(client, "admin@test.com")
    res = _status(client, admin, ready_course.id, "closed")
    assert res.status_code == 409, res.text
    detail = res.json()["detail"]
    assert detail["reason"] == "illegal_transition"
    assert detail["from"] == "draft" and detail["to"] == "closed"


# ---------------- Earning the move ----------------
def test_a_course_may_open_once_it_has_a_teacher_a_slot_and_dates(
    client, db, world, ready_course
):
    admin = auth(client, "admin@test.com")
    res = _status(client, admin, ready_course.id, "open")
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "open"


def test_a_course_with_no_timetable_cannot_open_and_says_what_it_lacks(
    client, db, world, ready_course
):
    """Opening enrolment on a course with no slots seats students in something
    that cannot be delivered."""
    for slot in list(ready_course.schedules):
        db.delete(slot)
    db.flush()

    admin = auth(client, "admin@test.com")
    res = _status(client, admin, ready_course.id, "open")
    assert res.status_code == 409, res.text
    detail = res.json()["detail"]
    assert detail["reason"] == "not_ready_to_open"
    # The refusal is a to-do list, not a "no".
    assert any("horario" in b.lower() for b in detail["blockers"]), detail["blockers"]


def test_a_course_with_no_teacher_cannot_open(client, db, world, ready_course):
    for row in db.query(CourseTeacher).filter(
        CourseTeacher.course_id == ready_course.id
    ):
        db.delete(row)
    db.flush()

    admin = auth(client, "admin@test.com")
    res = _status(client, admin, ready_course.id, "open")
    assert res.status_code == 409, res.text
    assert any(
        "profesor" in b.lower() for b in res.json()["detail"]["blockers"]
    ), res.text


def test_a_course_with_no_dates_cannot_open(client, db, world, ready_course):
    ready_course.start_date = None
    ready_course.end_date = None
    db.flush()

    admin = auth(client, "admin@test.com")
    res = _status(client, admin, ready_course.id, "open")
    assert res.status_code == 409, res.text
    assert any("fecha" in b.lower() for b in res.json()["detail"]["blockers"])


# ---------------- Students in the way ----------------
def test_a_course_with_students_cannot_go_back_to_draft(client, db, world):
    """Returning it to draft would drop it out of those students' view without
    giving any of them a baja."""
    course = db.get(Course, world["course_a"].id)
    course.status = CourseStatus.open
    db.flush()

    admin = auth(client, "admin@test.com")
    res = _status(client, admin, course.id, "draft")
    assert res.status_code == 409, res.text
    assert res.json()["detail"]["reason"] == "has_enrollments"


def test_a_course_with_students_cannot_be_archived(client, db, world):
    course = db.get(Course, world["course_a"].id)
    course.status = CourseStatus.open
    db.flush()

    admin = auth(client, "admin@test.com")
    res = _status(client, admin, course.id, "archived")
    assert res.status_code == 409, res.text
    assert res.json()["detail"]["reason"] == "has_enrollments"


def test_an_emptied_course_archives_cleanly(client, db, world):
    course = db.get(Course, world["course_a"].id)
    course.status = CourseStatus.open
    enrollment = db.get(Enrollment, world["enrollment"].id)
    enrollment.status = EnrollmentStatus.withdrawn
    db.flush()

    admin = auth(client, "admin@test.com")
    assert _status(client, admin, course.id, "archived").status_code == 200


# ---------------- The gate that gives it teeth ----------------
@pytest.mark.parametrize("blocked", ["draft", "closed", "archived"])
def test_a_course_not_open_refuses_new_enrolments(client, db, world, blocked):
    course = db.get(Course, world["course_b"].id)
    course.status = CourseStatus(blocked)
    db.flush()

    admin = auth(client, "admin@test.com")
    res = client.post(
        "/enrollments",
        headers=admin,
        json={"student_id": world["outsider"].id, "course_id": course.id},
    )
    assert res.status_code == 409, res.text
    assert res.json()["detail"]["reason"] == "course_not_open"


@pytest.mark.parametrize("allowed", ["open", "in_progress"])
def test_late_enrolment_into_a_running_course_is_normal(client, db, world, allowed):
    course = db.get(Course, world["course_b"].id)
    course.status = CourseStatus(allowed)
    db.flush()

    admin = auth(client, "admin@test.com")
    res = client.post(
        "/enrollments",
        headers=admin,
        json={"student_id": world["outsider"].id, "course_id": course.id},
    )
    assert res.status_code == 201, res.text


# ---------------- Listing ----------------
def test_archived_courses_stay_out_of_the_default_list(client, db, world):
    course = db.get(Course, world["course_b"].id)
    course.status = CourseStatus.archived
    db.flush()

    admin = auth(client, "admin@test.com")
    default = client.get("/catalog/courses", headers=admin).json()
    assert course.id not in [c["id"] for c in default]

    everything = client.get(
        "/catalog/courses", headers=admin, params={"include_archived": True}
    ).json()
    assert course.id in [c["id"] for c in everything]


def test_the_list_carries_the_numbers_the_panel_renders(client, world):
    """Counted server-side; the panel used to fetch every enrolment and schedule
    in the academy to work these out."""
    admin = auth(client, "admin@test.com")
    courses = client.get("/catalog/courses", headers=admin).json()
    course_a = next(c for c in courses if c["id"] == world["course_a"].id)
    assert course_a["seats_taken"] == 1
    assert course_a["teacher_count"] == 1
    assert course_a["schedule_count"] == 1


def test_a_status_change_leaves_a_trace(client, db, world, ready_course):
    admin = auth(client, "admin@test.com")
    assert _status(client, admin, ready_course.id, "open").status_code == 200
    rows = client.get(
        "/audit",
        headers=admin,
        params={"entity": "course", "entity_id": ready_course.id},
    ).json()["items"]
    assert any(r["action"] == "status_change" for r in rows), rows


def test_status_cannot_be_smuggled_through_a_generic_patch(client, world, ready_course):
    """Every move has prerequisites; a patch would route around all of them."""
    admin = auth(client, "admin@test.com")
    res = client.patch(
        f"/catalog/courses/{ready_course.id}",
        headers=admin,
        json={"status": "open"},
    )
    # Ignored rather than applied: the field is not part of the update schema.
    assert res.status_code in (200, 422), res.text
    if res.status_code == 200:
        assert res.json()["status"] == "draft"
