"""Turning accounts off, handing classes over, and acting on many rows at once.

A teacher who leaves cannot be deleted — their schedules reference the row, and
their grades and attendance have to survive them — so leaving is `is_active =
False`. Switching one off while they still hold live courses would leave those
courses with somebody who cannot log in, so the baja is refused until the
classes have a new owner, and the refusal names them.

The bulk operations are deliberately not all-or-nothing: seating thirty students
where two clash is twenty-eight successes and two problems to look at.
"""

import pytest

from app.models import (
    Course,
    CourseStatus,
    CourseTeacher,
    Enrollment,
    EnrollmentStatus,
    Language,
    Schedule,
    TeacherLanguage,
    User,
    UserRole,
)
from tests.conftest import auth, make_user


# ---------------- Account state ----------------
def test_a_deactivated_account_cannot_log_in(client, db, world):
    student = db.get(User, world["student"].id)
    student.is_active = False
    db.flush()

    res = client.post(
        "/auth/login", data={"username": "student@test.com", "password": "secret123"}
    )
    assert res.status_code == 401, res.text


def test_deactivation_ends_the_sessions_already_open(client, db, world):
    """A baja that only took effect at the next login would leave a teacher
    working for the lifetime of their access token."""
    token = auth(client, "student@test.com")
    assert client.get("/enrollments", headers=token).status_code == 200

    admin = auth(client, "admin@test.com")
    assert (
        client.patch(
            f"/users/{world['student'].id}", headers=admin, json={"is_active": False}
        ).status_code
        == 200
    )
    assert client.get("/enrollments", headers=token).status_code == 401


def test_a_teacher_with_live_courses_cannot_be_deactivated(client, world):
    admin = auth(client, "admin@test.com")
    res = client.patch(
        f"/users/{world['teacher_a'].id}", headers=admin, json={"is_active": False}
    )
    assert res.status_code == 409, res.text
    detail = res.json()["detail"]
    assert detail["reason"] == "has_live_assignments"
    # The refusal is the entry point to the fix: it names what to reassign.
    assert detail["courses"][0]["course_id"] == world["course_a"].id


def test_a_teacher_with_nothing_live_goes_quietly(client, db, world):
    course = db.get(Course, world["course_a"].id)
    course.status = CourseStatus.closed
    db.flush()

    admin = auth(client, "admin@test.com")
    res = client.patch(
        f"/users/{world['teacher_a'].id}", headers=admin, json={"is_active": False}
    )
    assert res.status_code == 200, res.text
    assert res.json()["is_active"] is False


def test_nobody_can_deactivate_themselves(client, world):
    admin = auth(client, "admin@test.com")
    res = client.patch(
        f"/users/{world['admin'].id}", headers=admin, json={"is_active": False}
    )
    assert res.status_code == 409, res.text


def test_an_inactive_teacher_is_not_offered_in_the_picker(client, db, world):
    course = db.get(Course, world["course_a"].id)
    course.status = CourseStatus.closed
    db.flush()
    admin = auth(client, "admin@test.com")
    client.patch(
        f"/users/{world['teacher_a'].id}", headers=admin, json={"is_active": False}
    )

    offered = client.get("/teachers", headers=admin).json()
    assert world["teacher_a"].id not in [t["id"] for t in offered]

    everyone = client.get(
        "/teachers", headers=admin, params={"include_inactive": True}
    ).json()
    assert world["teacher_a"].id in [t["id"] for t in everyone]


# ---------------- Handover ----------------
def test_reassigning_moves_the_course_and_its_slots(client, db, world):
    admin = auth(client, "admin@test.com")
    res = client.post(
        f"/teachers/{world['teacher_a'].id}/reassign",
        headers=admin,
        json={"to_teacher_id": world["teacher_b"].id},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["moved"] == 1 and body["failed"] == 0
    assert body["outcomes"][0]["schedules_moved"] == 1

    db.expire_all()
    slot = db.get(Schedule, world["schedule_a"].id)
    assert slot.teacher_id == world["teacher_b"].id
    # The destination gains the right to teach the course...
    assert db.query(CourseTeacher).filter(
        CourseTeacher.course_id == world["course_a"].id,
        CourseTeacher.teacher_id == world["teacher_b"].id,
    ).count() == 1
    # ...and the outgoing assignment is gone.
    assert db.query(CourseTeacher).filter(
        CourseTeacher.course_id == world["course_a"].id,
        CourseTeacher.teacher_id == world["teacher_a"].id,
    ).count() == 0


def test_a_handover_unblocks_the_baja(client, db, world):
    """The whole point of the flow: refuse, reassign, then allow."""
    admin = auth(client, "admin@test.com")
    assert (
        client.patch(
            f"/users/{world['teacher_a'].id}", headers=admin, json={"is_active": False}
        ).status_code
        == 409
    )
    client.post(
        f"/teachers/{world['teacher_a'].id}/reassign",
        headers=admin,
        json={"to_teacher_id": world["teacher_b"].id},
    )
    assert (
        client.patch(
            f"/users/{world['teacher_a'].id}", headers=admin, json={"is_active": False}
        ).status_code
        == 200
    )


def test_an_unqualified_destination_is_refused_per_course(client, db, world):
    """Qualification is a hard rule everywhere else, so it is one here too."""
    other = Language(name="Alemán", tenant_id=None)
    db.add(other)
    db.flush()
    db.add(TeacherLanguage(teacher_id=world["teacher_b"].id, language_id=other.id))
    db.flush()

    admin = auth(client, "admin@test.com")
    res = client.post(
        f"/teachers/{world['teacher_a'].id}/reassign",
        headers=admin,
        json={"to_teacher_id": world["teacher_b"].id},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["moved"] == 0 and body["failed"] == 1
    assert "cualificado" in body["outcomes"][0]["reason"].lower()


def test_a_teacher_cannot_hand_courses_to_themselves(client, world):
    admin = auth(client, "admin@test.com")
    res = client.post(
        f"/teachers/{world['teacher_a'].id}/reassign",
        headers=admin,
        json={"to_teacher_id": world["teacher_a"].id},
    )
    assert res.status_code == 400, res.text


def test_courses_cannot_be_handed_to_someone_on_baja(client, db, world):
    teacher_b = db.get(User, world["teacher_b"].id)
    teacher_b.is_active = False
    db.flush()

    admin = auth(client, "admin@test.com")
    res = client.post(
        f"/teachers/{world['teacher_a'].id}/reassign",
        headers=admin,
        json={"to_teacher_id": world["teacher_b"].id},
    )
    assert res.status_code == 409, res.text


def test_the_assignments_endpoint_lists_what_a_baja_would_strand(client, world):
    admin = auth(client, "admin@test.com")
    res = client.get(f"/teachers/{world['teacher_a'].id}/assignments", headers=admin)
    assert res.status_code == 200, res.text
    assert res.json() == [
        {
            "course_id": world["course_a"].id,
            "course_name": world["course_a"].name,
            "schedule_count": 1,
        }
    ]


# ---------------- Bulk enrolment ----------------
def test_bulk_enrolment_seats_everyone_it_can(client, db, world):
    extra = [make_user(db, f"bulk{i}@test.com", UserRole.student) for i in range(3)]
    db.flush()

    admin = auth(client, "admin@test.com")
    res = client.post(
        "/enrollments/bulk",
        headers=admin,
        json={
            "course_id": world["course_b"].id,
            "student_ids": [s.id for s in extra],
            "amount": 100.0,
        },
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["created"] == 3 and body["failed"] == 0
    assert all(o["enrollment_code"] for o in body["outcomes"])


def test_a_batch_reports_per_student_rather_than_rolling_back(client, db, world):
    """Twenty-eight successes and two problems beats seven untouched."""
    already = world["student"].id  # already enrolled in course_a
    fresh = make_user(db, "fresh@test.com", UserRole.student)
    db.flush()

    admin = auth(client, "admin@test.com")
    res = client.post(
        "/enrollments/bulk",
        headers=admin,
        json={"course_id": world["course_a"].id, "student_ids": [already, fresh.id]},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["created"] == 1 and body["failed"] == 1
    refused = next(o for o in body["outcomes"] if not o["ok"])
    assert refused["student_id"] == already
    assert "matriculado" in refused["reason"].lower()


def test_a_batch_bigger_than_the_room_fills_it_and_then_refuses(client, db, world):
    course = db.get(Course, world["course_b"].id)
    course.max_students = 2
    db.flush()
    extra = [make_user(db, f"cap{i}@test.com", UserRole.student) for i in range(4)]
    db.flush()

    admin = auth(client, "admin@test.com")
    body = client.post(
        "/enrollments/bulk",
        headers=admin,
        json={"course_id": course.id, "student_ids": [s.id for s in extra]},
    ).json()
    assert body["created"] == 2 and body["failed"] == 2
    assert all(
        "cupo" in o["reason"].lower() for o in body["outcomes"] if not o["ok"]
    )


def test_a_batch_cannot_seat_anyone_in_a_course_that_is_not_open(client, db, world):
    course = db.get(Course, world["course_b"].id)
    course.status = CourseStatus.draft
    db.flush()

    admin = auth(client, "admin@test.com")
    res = client.post(
        "/enrollments/bulk",
        headers=admin,
        json={"course_id": course.id, "student_ids": [world["outsider"].id]},
    )
    assert res.status_code == 409, res.text
    assert res.json()["detail"]["reason"] == "course_not_open"


def test_a_repeated_student_in_the_batch_is_seated_once(client, db, world):
    admin = auth(client, "admin@test.com")
    body = client.post(
        "/enrollments/bulk",
        headers=admin,
        json={
            "course_id": world["course_b"].id,
            "student_ids": [world["outsider"].id, world["outsider"].id],
        },
    ).json()
    assert body["created"] == 1
    assert len(body["outcomes"]) == 1


def test_bulk_enrolment_is_traced_like_the_single_one(client, world):
    admin = auth(client, "admin@test.com")
    created = client.post(
        "/enrollments/bulk",
        headers=admin,
        json={"course_id": world["course_b"].id, "student_ids": [world["outsider"].id]},
    ).json()
    enrollment_id = created["outcomes"][0]["enrollment_id"]
    rows = client.get(
        "/audit",
        headers=admin,
        params={"entity": "enrollment", "entity_id": enrollment_id},
    ).json()["items"]
    assert any(r["action"] == "create" for r in rows), rows


# ---------------- KPIs ----------------
def test_the_kpis_describe_capacity_not_just_activity(client, db, world):
    admin = auth(client, "admin@test.com")
    kpis = client.get("/dashboard", headers=admin).json()["kpis"]
    assert kpis is not None
    # Both fixture courses default to `open` in an existing database.
    assert kpis["active_courses"] >= 1
    assert kpis["active_students"] == 1
    assert kpis["seats_offered"] >= kpis["seats_taken"]
    assert 0 <= kpis["occupancy_rate"] <= 1


def test_a_student_taking_two_courses_counts_once(client, db, world):
    course_b = db.get(Course, world["course_b"].id)
    course_b.status = CourseStatus.open
    db.flush()
    admin = auth(client, "admin@test.com")
    client.post(
        "/enrollments",
        headers=admin,
        json={
            "student_id": world["student"].id,
            "course_id": course_b.id,
        },
        params={"force": True},
    )
    kpis = client.get("/dashboard", headers=admin).json()["kpis"]
    assert kpis["active_students"] == 1


def test_a_student_never_receives_academy_kpis(client, world):
    body = client.get("/dashboard", headers=auth(client, "student@test.com")).json()
    assert body["kpis"] is None
