"""The audit trail: sensitive changes are recorded, with before/after."""

import pytest

from tests.conftest import auth


@pytest.fixture
def session_a(client, world):
    admin = auth(client, "admin@test.com")
    return client.post(
        "/sessions/generate", headers=admin, json={"schedule_id": world["schedule_a"].id}
    ).json()[0]


def _audit(client, headers, **params):
    return client.get("/audit", headers=headers, params=params).json()


def test_grading_and_regrading_leaves_a_trail(client, world):
    teacher = auth(client, "teacher_a@test.com")
    admin = auth(client, "admin@test.com")
    exam = {"enrollment_id": world["enrollment"].id, "evaluation_name": "Examen"}

    created = client.post("/grades", headers=teacher, json={**exam, "score": 6}).json()
    client.post("/grades", headers=teacher, json={**exam, "score": 9})

    rows = _audit(client, admin, entity="grade", entity_id=created["id"])
    assert [r["action"] for r in rows] == ["update", "create"]  # newest first
    change = rows[0]
    assert change["before"]["score"] == 6.0
    assert change["after"]["score"] == 9.0
    assert change["actor_id"] == world["teacher_a"].id


def test_attendance_correction_is_audited(client, world, session_a):
    teacher = auth(client, "teacher_a@test.com")
    admin = auth(client, "admin@test.com")
    base = {"enrollment_id": world["enrollment"].id, "session_id": session_a["id"]}
    mark = client.post("/attendance", headers=teacher, json={**base, "status": "present"}).json()
    client.post("/attendance", headers=teacher, json={**base, "status": "absent"})

    rows = _audit(client, admin, entity="attendance", entity_id=mark["id"])
    assert rows[0]["before"]["status"] == "present"
    assert rows[0]["after"]["status"] == "absent"


def test_enrollment_status_change_is_audited(client, world):
    admin = auth(client, "admin@test.com")
    client.patch(
        f"/enrollments/{world['enrollment'].id}", headers=admin, json={"status": "completed"}
    )
    rows = _audit(client, admin, entity="enrollment", entity_id=world["enrollment"].id)
    assert rows[0]["before"]["status"] == "active"
    assert rows[0]["after"]["status"] == "completed"


def test_a_user_password_change_never_records_the_hash(client, world):
    admin = auth(client, "admin@test.com")
    client.patch(
        f"/users/{world['student'].id}", headers=admin, json={"password": "brandnew123"}
    )
    rows = _audit(client, admin, entity="user", entity_id=world["student"].id)
    assert rows[0]["before"]["password_hash"] == "***"
    assert rows[0]["after"]["password_hash"] == "***"


def test_the_audit_log_is_admin_only(client, world):
    teacher = auth(client, "teacher_a@test.com")
    assert client.get("/audit", headers=teacher).status_code == 403
    student = auth(client, "student@test.com")
    assert client.get("/audit", headers=student).status_code == 403


def test_a_rolled_back_change_leaves_no_audit_row(client, world, session_a):
    """The audit row shares the transaction, so a failed change records nothing.

    Renaming a grade onto an existing evaluation is rejected (409); no audit
    entry for that grade's 'update' should survive.
    """
    teacher = auth(client, "teacher_a@test.com")
    admin = auth(client, "admin@test.com")
    eid = world["enrollment"].id
    client.post("/grades", headers=teacher, json={"enrollment_id": eid, "evaluation_name": "A", "score": 5})
    g2 = client.post("/grades", headers=teacher, json={"enrollment_id": eid, "evaluation_name": "B", "score": 5}).json()

    before_rows = _audit(client, admin, entity="grade", entity_id=g2["id"])
    res = client.patch(f"/grades/{g2['id']}", headers=teacher, json={"evaluation_name": "A"})
    assert res.status_code == 409
    after_rows = _audit(client, admin, entity="grade", entity_id=g2["id"])
    assert len(after_rows) == len(before_rows), "the failed rename recorded nothing"
