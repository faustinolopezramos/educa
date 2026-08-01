"""The five enrollment states, meaning the same thing everywhere.

Before these, three different answers to "who counts as a student of this
course?" lived side by side: the cupo counted only `active`, the lobby admitted
`active` and `enrolled`, and the attendance register counted only `active`
again. A student sitting in "Inscrito" could therefore walk into a virtual
classroom of a course whose register they did not appear on, while occupying no
seat at all — so the course could be filled past `max_students` without a single
409.

These tests pin the three questions (`ENROLLMENT_OCCUPIES_SEAT`,
`ENROLLMENT_HAS_ACCESS`, `ENROLLMENT_OWES`) to one answer each.
"""

from datetime import date

from app.models import (
    ENROLLMENT_HAS_ACCESS,
    ENROLLMENT_OCCUPIES_SEAT,
    ENROLLMENT_OWES,
    Course,
    Enrollment,
    EnrollmentStatus,
    enrollment_transition_allowed,
)
from app.services.enrollments import seats_taken
from app.services.sequences import next_enrollment_code
from tests.conftest import auth, make_user


# ---------------- Seats ----------------
def test_an_enrolled_student_takes_a_seat_like_an_active_one(client, db, world):
    """A course of one seat is full once one person holds it, however they hold it.

    This is the defect in its plainest form: creating the matrícula as
    "Inscrito" used to sail past the cupo entirely.
    """
    course = db.get(Course, world["course_b"].id)
    course.max_students = 1
    db.flush()
    admin = auth(client, "admin@test.com")

    first = client.post(
        "/enrollments",
        headers=admin,
        json={
            "student_id": world["outsider"].id,
            "course_id": course.id,
            "status": "enrolled",
        },
    )
    assert first.status_code == 201, first.text

    second_student = make_user(db, "second@test.com", world["student"].role)
    db.flush()
    second = client.post(
        "/enrollments",
        headers=admin,
        json={
            "student_id": second_student.id,
            "course_id": course.id,
            "status": "enrolled",
        },
    )
    assert second.status_code == 409, second.text
    assert second.json()["detail"]["reason"] == "capacity"


def test_pausing_an_enrollment_releases_its_seat(client, db, world):
    admin = auth(client, "admin@test.com")
    course_id = world["course_a"].id
    assert seats_taken(db, course_id) == 1

    client.patch(
        f"/enrollments/{world['enrollment'].id}",
        headers=admin,
        json={"status": "inactive"},
    )
    db.expire_all()
    assert seats_taken(db, course_id) == 0


def test_a_seat_cannot_be_reclaimed_once_the_room_filled_up(client, db, world):
    """Reactivation has to find a seat free — the course may have moved on."""
    admin = auth(client, "admin@test.com")
    course = db.get(Course, world["course_a"].id)
    course.max_students = 1
    db.flush()

    client.patch(
        f"/enrollments/{world['enrollment'].id}",
        headers=admin,
        json={"status": "inactive"},
    )
    # Someone else takes the freed seat.
    replacement = client.post(
        "/enrollments",
        headers=admin,
        json={"student_id": world["outsider"].id, "course_id": course.id},
    )
    assert replacement.status_code == 201, replacement.text

    back = client.patch(
        f"/enrollments/{world['enrollment'].id}",
        headers=admin,
        json={"status": "active"},
    )
    assert back.status_code == 409, back.text
    assert back.json()["detail"]["reason"] == "capacity"


def test_the_register_lists_everyone_holding_a_seat(client, db, world):
    """The teacher takes attendance from this list, so it must not omit the
    students the lobby is about to let in."""
    enrollment = db.get(Enrollment, world["enrollment"].id)
    enrollment.status = EnrollmentStatus.enrolled
    db.flush()

    teacher = auth(client, "teacher_a@test.com")
    res = client.get(f"/catalog/courses/{world['course_a'].id}/students", headers=teacher)
    assert res.status_code == 200, res.text
    assert [s["id"] for s in res.json()] == [world["student"].id]


def test_a_withdrawn_student_leaves_the_register(client, db, world):
    enrollment = db.get(Enrollment, world["enrollment"].id)
    enrollment.status = EnrollmentStatus.withdrawn
    db.flush()

    teacher = auth(client, "teacher_a@test.com")
    res = client.get(f"/catalog/courses/{world['course_a'].id}/students", headers=teacher)
    assert res.status_code == 200, res.text
    assert res.json() == []


def test_lowering_the_cupo_counts_the_same_seats_enrolling_does(client, db, world):
    enrollment = db.get(Enrollment, world["enrollment"].id)
    enrollment.status = EnrollmentStatus.enrolled
    db.flush()

    admin = auth(client, "admin@test.com")
    res = client.patch(
        f"/catalog/courses/{world['course_a'].id}",
        headers=admin,
        json={"max_students": 0},
    )
    assert res.status_code == 409, res.text
    assert res.json()["detail"]["reason"] == "capacity_below_enrolled"


# ---------------- Timetable ----------------
def test_a_clash_is_detected_against_a_merely_enrolled_course(client, db, world):
    """A student cannot be in two rooms at once, whichever of the two they have
    only been "Inscrito" in so far."""
    enrollment = db.get(Enrollment, world["enrollment"].id)
    enrollment.status = EnrollmentStatus.enrolled
    db.flush()

    # Make course_b's slot collide with course_a's.
    schedule_b = world["schedule_b"]
    schedule_b.day_of_week = world["schedule_a"].day_of_week
    schedule_b.start_time = world["schedule_a"].start_time
    schedule_b.end_time = world["schedule_a"].end_time
    db.flush()

    admin = auth(client, "admin@test.com")
    res = client.post(
        "/enrollments",
        headers=admin,
        json={"student_id": world["student"].id, "course_id": world["course_b"].id},
    )
    assert res.status_code == 409, res.text
    assert res.json()["detail"]["reason"] == "student_schedule"


# ---------------- Transitions ----------------
def test_the_transition_table_matches_the_documented_lifecycle():
    E = EnrollmentStatus
    legal = [
        (E.enrolled, E.active),
        (E.enrolled, E.inactive),
        (E.enrolled, E.withdrawn),
        (E.active, E.inactive),
        (E.active, E.certified),
        (E.active, E.withdrawn),
        (E.inactive, E.active),
        (E.inactive, E.withdrawn),
    ]
    illegal = [
        (E.enrolled, E.certified),  # nobody certifies a course they never began
        (E.active, E.enrolled),  # a started course does not un-start
        (E.inactive, E.enrolled),
        (E.certified, E.active),  # a certificate has already been issued
        (E.certified, E.withdrawn),
        (E.withdrawn, E.active),  # coming back is a new matrícula, with a new code
        (E.withdrawn, E.enrolled),
    ]
    for current, target in legal:
        assert enrollment_transition_allowed(current, target), f"{current}→{target}"
    for current, target in illegal:
        assert not enrollment_transition_allowed(current, target), f"{current}→{target}"
    for state in E:
        assert enrollment_transition_allowed(state, state), f"{state} should stay put"


def test_a_student_who_dropped_out_returns_as_a_new_matricula(client, db, world):
    """The way back in is a fresh enrollment with its own code, which the partial
    unique index on (student, course) deliberately allows."""
    admin = auth(client, "admin@test.com")
    original_code = world["enrollment"].enrollment_code
    client.patch(
        f"/enrollments/{world['enrollment'].id}",
        headers=admin,
        json={"status": "withdrawn"},
    )
    res = client.post(
        "/enrollments",
        headers=admin,
        json={"student_id": world["student"].id, "course_id": world["course_a"].id},
    )
    assert res.status_code == 201, res.text
    assert res.json()["enrollment_code"] != original_code


# ---------------- Money ----------------
def test_a_paused_enrollment_still_owes_its_cuota(client, db, world):
    """Pausing a course is not a way to stop being delinquent on it."""
    admin = auth(client, "admin@test.com")
    created = client.post(
        "/enrollments",
        headers=admin,
        json={
            "student_id": world["outsider"].id,
            "course_id": world["course_b"].id,
            "amount": 100.0,
            "due_date": date(2020, 1, 1).isoformat(),
        },
    )
    assert created.status_code == 201, created.text
    assert created.json()["payment_status"] == "overdue"

    paused = client.patch(
        f"/enrollments/{created.json()['id']}",
        headers=admin,
        json={"status": "inactive"},
    )
    assert paused.status_code == 200, paused.text

    refreshed = client.post("/payments/refresh-statuses", headers=admin)
    assert refreshed.status_code in (200, 201), refreshed.text
    still = client.get("/enrollments", headers=admin).json()
    owed = next(e for e in still if e["id"] == created.json()["id"])
    assert owed["payment_status"] == "overdue"


# ---------------- Audit ----------------
def test_creating_an_enrollment_leaves_a_trace(client, world):
    """A matrícula seats a student, opens a ledger and mints a code; editing and
    deleting one were traced, creating one was not."""
    admin = auth(client, "admin@test.com")
    created = client.post(
        "/enrollments",
        headers=admin,
        json={"student_id": world["outsider"].id, "course_id": world["course_b"].id},
    )
    assert created.status_code == 201, created.text

    rows = client.get(
        "/audit",
        headers=admin,
        params={"entity": "enrollment", "entity_id": created.json()["id"]},
    ).json()["items"]
    assert any(r["action"] == "create" for r in rows), rows


# ---------------- The predicates themselves ----------------
def test_the_three_questions_have_one_answer_each():
    E = EnrollmentStatus
    assert ENROLLMENT_OCCUPIES_SEAT == {E.enrolled, E.active}
    assert ENROLLMENT_HAS_ACCESS == {E.enrolled, E.active}
    assert ENROLLMENT_OWES == {E.enrolled, E.active, E.inactive}
    # Whatever else changes, a dropout is never any of the three.
    for predicate in (ENROLLMENT_OCCUPIES_SEAT, ENROLLMENT_HAS_ACCESS, ENROLLMENT_OWES):
        assert E.withdrawn not in predicate


def test_seats_taken_can_exclude_the_row_being_reactivated(db, world):
    course_id = world["course_a"].id
    assert seats_taken(db, course_id) == 1
    assert seats_taken(db, course_id, exclude_enrollment_id=world["enrollment"].id) == 0


def test_an_extra_enrollment_row_is_counted(db, world):
    db.add(
        Enrollment(
            student_id=world["outsider"].id,
            course_id=world["course_a"].id,
            status=EnrollmentStatus.enrolled,
            enrollment_code=next_enrollment_code(db, year=date.today().year),
        )
    )
    db.flush()
    assert seats_taken(db, world["course_a"].id) == 2
