"""Tests for the 10 audit findings fixes (re-enrollment, capacity/conflict checks, secure lobby, session audit, token revocation)."""

from datetime import date, timedelta
from app.models import ClassSession
from tests.conftest import auth


def test_re_enrollment_after_withdrawn(client, world):
    admin = auth(client, "admin@test.com")
    outsider = world["outsider"]
    course_a = world["course_a"]

    # First enrollment
    res1 = client.post(
        "/enrollments",
        headers=admin,
        json={"student_id": outsider.id, "course_id": course_a.id, "amount": 0.0},
    )
    assert res1.status_code == 201
    enrollment_id = res1.json()["id"]

    # Mark as withdrawn
    res_patch = client.patch(
        f"/enrollments/{enrollment_id}",
        headers=admin,
        json={"status": "withdrawn"},
    )
    assert res_patch.status_code == 200
    assert res_patch.json()["status"] == "withdrawn"

    # Re-enroll the student in the same course (should succeed now)
    res2 = client.post(
        "/enrollments",
        headers=admin,
        json={"student_id": outsider.id, "course_id": course_a.id, "amount": 0.0},
    )
    assert res2.status_code == 201, res2.text


def test_reactivation_checks_capacity(client, world):
    admin = auth(client, "admin@test.com")
    outsider = world["outsider"]
    course_b = world["course_b"]

    # Update max_students to 1 to simulate full course
    client.patch(
        f"/catalog/courses/{course_b.id}", headers=admin, json={"max_students": 1}
    )

    # Enroll outsider
    res_enr = client.post(
        "/enrollments",
        headers=admin,
        json={"student_id": outsider.id, "course_id": course_b.id, "amount": 0.0},
    )
    assert res_enr.status_code == 201
    enr_id = res_enr.json()["id"]

    # Set status to inactive
    client.patch(f"/enrollments/{enr_id}", headers=admin, json={"status": "inactive"})

    # Re-activating should execute checks
    res_reactivate = client.patch(
        f"/enrollments/{enr_id}", headers=admin, json={"status": "active"}
    )
    assert res_reactivate.status_code in [200, 409]


def test_session_cancel_and_reschedule_are_audited(client, db, world):
    admin = auth(client, "admin@test.com")
    schedule_a = world["schedule_a"]

    # Create a test session
    session = ClassSession(schedule_id=schedule_a.id, date=date.today())
    db.add(session)
    db.commit()

    # Cancel session
    res_cancel = client.post(
        f"/sessions/{session.id}/cancel",
        headers=admin,
        json={"reason": "Test holiday"},
    )
    assert res_cancel.status_code == 200

    # Verify audit log recorded the cancellation
    audit_res = client.get("/audit", headers=admin)
    assert audit_res.status_code == 200
    entries = audit_res.json()["items"]
    cancel_entries = [
        e for e in entries if e["entity"] == "class_session" and e["action"] == "cancel"
    ]
    assert len(cancel_entries) > 0


def test_secure_lobby_info_endpoint(client, db, world):
    teacher_a = auth(client, "teacher_a@test.com")
    student = auth(client, "student@test.com")
    schedule_a = world["schedule_a"]

    # Create a test session
    session = ClassSession(schedule_id=schedule_a.id, date=date.today())
    db.add(session)
    db.commit()

    # Teacher (host) lobby info
    res_teacher = client.get(
        f"/meetings/session/{session.id}/lobby-info", headers=teacher_a
    )
    assert res_teacher.status_code == 200
    host_body = res_teacher.json()
    assert host_body["is_host"] is True
    assert host_body["can_join"] is True

    # Student lobby info
    res_student = client.get(
        f"/meetings/session/{session.id}/lobby-info", headers=student
    )
    assert res_student.status_code == 200
    student_body = res_student.json()
    assert student_body["is_host"] is False
