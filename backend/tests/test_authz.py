"""Authorization and validation rules outside the meetings module."""

from tests.conftest import auth


# ---------------- Course roster (what the teacher dashboard needs) ----------------
def test_teacher_can_list_the_students_of_their_own_course(client, world):
    headers = auth(client, "teacher_a@test.com")
    res = client.get(f"/catalog/courses/{world['course_a'].id}/students", headers=headers)
    assert res.status_code == 200
    body = res.json()
    assert [s["full_name"] for s in body] == ["Test student"]
    # The roster is a label source, not a directory: no emails.
    assert "email" not in body[0]


def test_teacher_cannot_list_the_students_of_another_course(client, world):
    headers = auth(client, "teacher_a@test.com")
    res = client.get(f"/catalog/courses/{world['course_b'].id}/students", headers=headers)
    assert res.status_code == 403


def test_student_cannot_list_a_roster(client, world):
    headers = auth(client, "student@test.com")
    res = client.get(f"/catalog/courses/{world['course_a'].id}/students", headers=headers)
    assert res.status_code == 403


def test_admin_can_list_any_roster(client, world):
    headers = auth(client, "admin@test.com")
    res = client.get(f"/catalog/courses/{world['course_b'].id}/students", headers=headers)
    assert res.status_code == 200


def test_teachers_may_not_read_the_full_user_directory(client, world):
    headers = auth(client, "teacher_a@test.com")
    assert client.get("/users", params={"role": "student"}, headers=headers).status_code == 403


# ---------------- Enrollments ----------------
def test_teacher_only_sees_enrollments_of_courses_they_teach(client, world):
    headers = auth(client, "teacher_b@test.com")
    # teacher_b teaches course_b, which has no enrollments.
    assert client.get("/enrollments", headers=headers).json() == []

    headers_a = auth(client, "teacher_a@test.com")
    body = client.get("/enrollments", headers=headers_a).json()
    assert [e["id"] for e in body] == [world["enrollment"].id]


def test_student_only_sees_their_own_enrollments(client, world):
    headers = auth(client, "outsider@test.com")
    assert client.get("/enrollments", headers=headers).json() == []


# ---------------- Grade validation ----------------
def test_grade_score_must_be_within_the_advertised_scale(client, world):
    headers = auth(client, "admin@test.com")
    enrollment_id = world["enrollment"].id
    for bad in (-1, 10.5, 9999):
        res = client.post(
            "/grades",
            headers=headers,
            json={"enrollment_id": enrollment_id, "evaluation_name": "T1", "score": bad},
        )
        assert res.status_code == 422, f"score={bad} should be rejected"


def test_grade_score_accepts_the_bounds(client, world):
    headers = auth(client, "admin@test.com")
    enrollment_id = world["enrollment"].id
    for good in (0, 10, 7.5):
        res = client.post(
            "/grades",
            headers=headers,
            json={
                "enrollment_id": enrollment_id,
                "evaluation_name": f"T{good}",
                "score": good,
            },
        )
        assert res.status_code == 201, res.text


def test_grade_update_is_also_bounded(client, world):
    headers = auth(client, "admin@test.com")
    created = client.post(
        "/grades",
        headers=headers,
        json={"enrollment_id": world["enrollment"].id, "evaluation_name": "T", "score": 5},
    ).json()
    res = client.patch(f"/grades/{created['id']}", headers=headers, json={"score": 99})
    assert res.status_code == 422


# ---------------- Token / account hardening ----------------
def test_a_malformed_subject_is_rejected_not_a_crash(client, world):
    from app.core.security import create_access_token

    token = create_access_token(subject="not-an-integer")
    res = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 401


def test_an_admin_cannot_delete_their_own_account(client, world):
    headers = auth(client, "admin@test.com")
    res = client.delete(f"/users/{world['admin'].id}", headers=headers)
    assert res.status_code == 409


# ---------------- Webhooks ----------------
def test_webhook_without_a_signature_is_rejected(client, world):
    res = client.post("/webhooks/zoom", json={"event": "meeting.ended", "meeting_id": "x"})
    assert res.status_code == 401


def test_manual_provider_has_no_webhook_endpoint(client, world):
    res = client.post("/webhooks/manual", json={"event": "meeting.ended"})
    assert res.status_code == 404
