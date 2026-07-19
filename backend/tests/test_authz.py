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


# ---------------- Timetable ----------------
def test_a_student_only_sees_the_timetable_of_their_own_courses(client, world):
    """The full timetable is a directory of who teaches what, and when."""
    headers = auth(client, "student@test.com")
    body = client.get("/schedules", headers=headers).json()
    assert [s["id"] for s in body] == [world["schedule_a"].id]


def test_a_student_cannot_reach_another_course_by_filtering(client, world):
    """The scope is applied first, so course_id/teacher_id only narrow it."""
    headers = auth(client, "student@test.com")
    body = client.get(
        "/schedules", params={"course_id": world["course_b"].id}, headers=headers
    ).json()
    assert body == []

    body = client.get(
        "/schedules", params={"teacher_id": world["teacher_b"].id}, headers=headers
    ).json()
    assert body == []


def test_a_student_with_no_enrollments_sees_an_empty_timetable(client, world):
    headers = auth(client, "outsider@test.com")
    assert client.get("/schedules", headers=headers).json() == []


def test_staff_still_read_the_whole_timetable(client, world):
    """Admins plan against it; teachers need to know when rooms are busy."""
    for who in ("admin@test.com", "teacher_a@test.com"):
        body = client.get("/schedules", headers=auth(client, who)).json()
        assert len(body) == 2, f"{who} should see the full timetable"


def test_a_teacher_can_still_narrow_the_timetable_to_their_own_classes(client, world):
    headers = auth(client, "teacher_a@test.com")
    body = client.get("/schedules", params={"mine": True}, headers=headers).json()
    assert [s["id"] for s in body] == [world["schedule_a"].id]


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


# ---------------- Password rules ----------------
def _new_user(password: str) -> dict:
    return {
        "email": "pw@test.com",
        "full_name": "Password Probe",
        "role": "student",
        "password": password,
    }


def test_a_password_must_not_be_empty_or_trivially_short(client, world):
    """The admin form checks this too, but the API is what actually enforces it."""
    headers = auth(client, "admin@test.com")
    for bad in ("", "short", "1234567"):
        res = client.post("/users", headers=headers, json=_new_user(bad))
        assert res.status_code == 422, f"password={bad!r} should be rejected"


def test_a_password_longer_than_bcrypt_can_hash_is_rejected(client, world):
    """bcrypt ignores everything past 72 bytes, so two such passwords would be
    interchangeable at login. Refuse rather than accept one we cannot check."""
    headers = auth(client, "admin@test.com")
    res = client.post("/users", headers=headers, json=_new_user("a" * 73))
    assert res.status_code == 422


def test_the_password_limit_counts_bytes_not_characters(client, world):
    """"é" is two bytes: 40 of them exceed bcrypt's limit while looking short."""
    headers = auth(client, "admin@test.com")
    res = client.post("/users", headers=headers, json=_new_user("é" * 40))
    assert res.status_code == 422


def test_a_reasonable_password_is_accepted_and_works(client, world):
    headers = auth(client, "admin@test.com")
    res = client.post("/users", headers=headers, json=_new_user("correct-horse"))
    assert res.status_code == 201, res.text
    assert auth(client, "pw@test.com", "correct-horse")


def test_changing_a_password_is_held_to_the_same_rule(client, world):
    headers = auth(client, "admin@test.com")
    res = client.patch(
        f"/users/{world['student'].id}", headers=headers, json={"password": "abc"}
    )
    assert res.status_code == 422


# ---------------- Webhooks ----------------
def test_webhook_without_a_signature_is_rejected(client, world):
    res = client.post("/webhooks/zoom", json={"event": "meeting.ended", "meeting_id": "x"})
    assert res.status_code == 401


def test_manual_provider_has_no_webhook_endpoint(client, world):
    res = client.post("/webhooks/manual", json={"event": "meeting.ended"})
    assert res.status_code == 404
