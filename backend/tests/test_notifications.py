"""In-app notifications and the events that raise them."""

import pytest

from tests.conftest import auth


@pytest.fixture
def session_a(client, world):
    admin = auth(client, "admin@test.com")
    return client.post(
        "/sessions/generate", headers=admin, json={"schedule_id": world["schedule_a"].id}
    ).json()[0]


# ---------------- Session cancellation notifies students ----------------
def test_cancelling_a_class_notifies_its_active_students(client, world, session_a):
    admin = auth(client, "admin@test.com")
    client.post(f"/sessions/{session_a['id']}/cancel", headers=admin, json={"reason": "x"})

    student = auth(client, "student@test.com")  # enrolled in course_a
    notes = client.get("/notifications", headers=student).json()
    assert len(notes) == 1
    assert notes[0]["kind"] == "session_cancelled"
    assert session_a["date"] in notes[0]["body"]


def test_an_unrelated_student_is_not_notified(client, world, session_a):
    admin = auth(client, "admin@test.com")
    client.post(f"/sessions/{session_a['id']}/cancel", headers=admin, json={"reason": "x"})
    outsider = auth(client, "outsider@test.com")  # enrolled in nothing
    assert client.get("/notifications", headers=outsider).json() == []


def test_rescheduling_tells_students_the_new_date(client, world, session_a):
    from datetime import date, timedelta

    admin = auth(client, "admin@test.com")
    new_date = (date.fromisoformat(session_a["date"]) + timedelta(days=2)).isoformat()
    client.post(f"/sessions/{session_a['id']}/reschedule", headers=admin, json={"new_date": new_date})

    student = auth(client, "student@test.com")
    notes = client.get("/notifications", headers=student).json()
    assert new_date in notes[0]["body"]


# ---------------- Read state ----------------
def test_unread_count_and_marking_read(client, world, session_a):
    admin = auth(client, "admin@test.com")
    client.post(f"/sessions/{session_a['id']}/cancel", headers=admin, json={"reason": "x"})
    student = auth(client, "student@test.com")

    assert client.get("/notifications/unread-count", headers=student).json()["count"] == 1
    note = client.get("/notifications", headers=student).json()[0]
    client.post(f"/notifications/{note['id']}/read", headers=student)
    assert client.get("/notifications/unread-count", headers=student).json()["count"] == 0


def test_you_cannot_read_someone_elses_notification(client, world, session_a):
    admin = auth(client, "admin@test.com")
    client.post(f"/sessions/{session_a['id']}/cancel", headers=admin, json={"reason": "x"})
    student = auth(client, "student@test.com")
    note = client.get("/notifications", headers=student).json()[0]

    outsider = auth(client, "outsider@test.com")
    assert client.post(f"/notifications/{note['id']}/read", headers=outsider).status_code == 404


def test_mark_all_read(client, world):
    admin = auth(client, "admin@test.com")
    sessions = client.post(
        "/sessions/generate", headers=admin, json={"schedule_id": world["schedule_a"].id}
    ).json()
    for s in sessions[:2]:
        client.post(f"/sessions/{s['id']}/cancel", headers=admin, json={"reason": "x"})
    student = auth(client, "student@test.com")
    assert client.get("/notifications/unread-count", headers=student).json()["count"] >= 1
    client.post("/notifications/read-all", headers=student)
    assert client.get("/notifications/unread-count", headers=student).json()["count"] == 0


# ---------------- At-risk alerts ----------------
def test_at_risk_alert_notifies_the_teacher(client, world):
    admin = auth(client, "admin@test.com")
    sessions = client.post(
        "/sessions/generate", headers=admin, json={"schedule_id": world["schedule_a"].id}
    ).json()
    teacher = auth(client, "teacher_a@test.com")
    # Mark the student absent → attendance rate 0 → at risk.
    for s in sessions[:3]:
        client.post(
            "/attendance",
            headers=teacher,
            json={"enrollment_id": world["enrollment"].id, "session_id": s["id"], "status": "absent"},
        )

    res = client.post(
        "/notifications/alerts/at-risk", headers=admin, params={"period": "month", "anchor": sessions[0]["date"]}
    )
    assert res.status_code == 200
    assert res.json()["alerts"] >= 1

    notes = client.get("/notifications", headers=teacher).json()
    assert any(n["kind"] == "at_risk" for n in notes)
