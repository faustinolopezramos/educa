"""Final grade (weighted) and level certificates."""

import pytest

from tests.conftest import auth


@pytest.fixture
def session_a(client, world):
    admin = auth(client, "admin@test.com")
    return client.post(
        "/sessions/generate", headers=admin, json={"schedule_id": world["schedule_a"].id}
    ).json()[0]


def _grade(client, headers, enrollment_id, name, score, session_id=None):
    body = {"enrollment_id": enrollment_id, "evaluation_name": name, "score": score}
    if session_id is not None:
        body["session_id"] = session_id
    return client.post("/grades", headers=headers, json=body)


# ---------------- Final grade ----------------
def test_final_grade_is_a_plain_average_when_no_weights_configured(client, world):
    teacher = auth(client, "teacher_a@test.com")
    eid = world["enrollment"].id
    _grade(client, teacher, eid, "Examen 1", 6)
    _grade(client, teacher, eid, "Examen 2", 8)

    body = client.get(f"/enrollments/{eid}/final-grade", headers=teacher).json()
    assert body["final_score"] == 7.0
    assert body["passed"] is True  # default passing 6
    assert {c["name"] for c in body["components"]} == {"Examen 1", "Examen 2"}


def test_weights_change_the_final_grade(client, world):
    admin = auth(client, "admin@test.com")
    teacher = auth(client, "teacher_a@test.com")
    cid = world["course_a"].id
    eid = world["enrollment"].id
    # Examen final worth 3x the daily grade.
    client.post(f"/catalog/courses/{cid}/evaluations", headers=admin, json={"name": "Examen final", "weight": 3})
    client.post(f"/catalog/courses/{cid}/evaluations", headers=admin, json={"name": "Participación", "weight": 1})

    _grade(client, teacher, eid, "Participación", 10)
    _grade(client, teacher, eid, "Examen final", 6)

    body = client.get(f"/enrollments/{eid}/final-grade", headers=teacher).json()
    # (10*1 + 6*3) / 4 = 7.0
    assert body["final_score"] == 7.0


def test_daily_grades_average_into_one_component(client, world, db):
    """Many 'Nota del día' across sessions collapse to one averaged component."""
    admin = auth(client, "admin@test.com")
    teacher = auth(client, "teacher_a@test.com")
    sessions = client.post(
        "/sessions/generate", headers=admin, json={"schedule_id": world["schedule_a"].id}
    ).json()
    eid = world["enrollment"].id
    _grade(client, teacher, eid, "Nota del día", 4, session_id=sessions[0]["id"])
    if len(sessions) > 1:
        _grade(client, teacher, eid, "Nota del día", 8, session_id=sessions[1]["id"])
        expected = 6.0
    else:
        expected = 4.0

    body = client.get(f"/enrollments/{eid}/final-grade", headers=teacher).json()
    daily = next(c for c in body["components"] if c["name"] == "Nota del día")
    assert daily["score"] == expected


def test_no_grades_means_no_final_and_not_passed(client, world):
    teacher = auth(client, "teacher_a@test.com")
    body = client.get(f"/enrollments/{world['enrollment'].id}/final-grade", headers=teacher).json()
    assert body["final_score"] is None
    assert body["passed"] is False


def test_a_student_sees_their_own_final_grade_but_not_others(client, world):
    admin = auth(client, "admin@test.com")
    _grade(client, admin, world["enrollment"].id, "Examen", 7)
    student = auth(client, "student@test.com")
    assert client.get(f"/enrollments/{world['enrollment'].id}/final-grade", headers=student).status_code == 200
    # The outsider is not on this enrollment.
    outsider = auth(client, "outsider@test.com")
    assert client.get(f"/enrollments/{world['enrollment'].id}/final-grade", headers=outsider).status_code == 404


# ---------------- Certificates ----------------
def test_a_passing_student_gets_a_certificate(client, world):
    admin = auth(client, "admin@test.com")
    _grade(client, admin, world["enrollment"].id, "Examen", 9)
    res = client.post(f"/enrollments/{world['enrollment'].id}/certificate", headers=admin)
    assert res.status_code == 201, res.text
    cert = res.json()
    assert cert["code"].startswith("EDUCA-")
    assert cert["final_score"] == 9.0


def test_a_failing_student_cannot_get_a_certificate(client, world):
    admin = auth(client, "admin@test.com")
    _grade(client, admin, world["enrollment"].id, "Examen", 3)
    res = client.post(f"/enrollments/{world['enrollment'].id}/certificate", headers=admin)
    assert res.status_code == 409
    assert res.json()["detail"]["reason"] == "not_passed"


def test_a_certificate_cannot_be_issued_twice(client, world):
    admin = auth(client, "admin@test.com")
    _grade(client, admin, world["enrollment"].id, "Examen", 8)
    assert client.post(f"/enrollments/{world['enrollment'].id}/certificate", headers=admin).status_code == 201
    assert client.post(f"/enrollments/{world['enrollment'].id}/certificate", headers=admin).status_code == 409


def test_certificate_pdf_downloads_for_the_owner(client, world):
    admin = auth(client, "admin@test.com")
    _grade(client, admin, world["enrollment"].id, "Examen", 8)
    cert = client.post(f"/enrollments/{world['enrollment'].id}/certificate", headers=admin).json()
    student = auth(client, "student@test.com")
    res = client.get(f"/certificates/{cert['id']}/pdf", headers=student)
    assert res.status_code == 200
    assert res.headers["content-type"] == "application/pdf"
    assert res.content[:5] == b"%PDF-"


def test_certificate_verification_by_code(client, world):
    admin = auth(client, "admin@test.com")
    _grade(client, admin, world["enrollment"].id, "Examen", 8)
    cert = client.post(f"/enrollments/{world['enrollment'].id}/certificate", headers=admin).json()
    student = auth(client, "student@test.com")
    res = client.get(f"/certificates/{cert['code']}", headers=student)
    assert res.status_code == 200
    assert res.json()["id"] == cert["id"]


def test_only_admin_issues_certificates(client, world):
    admin = auth(client, "admin@test.com")
    _grade(client, admin, world["enrollment"].id, "Examen", 8)
    teacher = auth(client, "teacher_a@test.com")
    assert client.post(f"/enrollments/{world['enrollment'].id}/certificate", headers=teacher).status_code == 403
