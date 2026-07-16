"""Authorization rules for virtual meetings.

A meeting carries the link into a live classroom, so visibility follows
enrollment (students) and ownership of the schedule (teachers) rather than
role alone.
"""

from tests.conftest import auth


# ---------------- Students ----------------
def test_student_list_only_shows_their_own_courses(client, world):
    headers = auth(client, "student@test.com")
    res = client.get("/meetings", headers=headers)
    assert res.status_code == 200
    ids = [m["id"] for m in res.json()]
    assert ids == [world["meeting_a"].id]


def test_student_cannot_read_meeting_of_a_course_they_are_not_in(client, world):
    headers = auth(client, "student@test.com")
    res = client.get(f"/meetings/{world['meeting_b'].id}", headers=headers)
    # 404 rather than 403: do not confirm the meeting exists.
    assert res.status_code == 404


def test_student_never_receives_the_host_url(client, world):
    headers = auth(client, "student@test.com")
    listed = client.get("/meetings", headers=headers).json()
    assert listed[0]["host_url"] is None
    assert listed[0]["join_url"] == "https://example.com/a"

    detail = client.get(f"/meetings/{world['meeting_a'].id}", headers=headers).json()
    assert detail["host_url"] is None


def test_student_with_no_enrollments_sees_nothing(client, world):
    headers = auth(client, "outsider@test.com")
    assert client.get("/meetings", headers=headers).json() == []


def test_student_cannot_create_a_meeting(client, world):
    headers = auth(client, "student@test.com")
    res = client.post(
        "/meetings",
        headers=headers,
        json={
            "schedule_id": world["schedule_a"].id,
            "provider": "manual",
            "start_time": "2026-08-01T10:00:00Z",
            "join_url": "https://evil.example.com",
        },
    )
    assert res.status_code == 403


# ---------------- Teachers ----------------
def test_teacher_list_only_shows_their_own_schedules(client, world):
    headers = auth(client, "teacher_a@test.com")
    ids = [m["id"] for m in client.get("/meetings", headers=headers).json()]
    assert ids == [world["meeting_a"].id]


def test_teacher_keeps_the_host_url_for_their_own_meeting(client, world):
    headers = auth(client, "teacher_a@test.com")
    res = client.get(f"/meetings/{world['meeting_a'].id}", headers=headers)
    assert res.json()["host_url"] == "https://example.com/a?host=1"


def test_teacher_cannot_read_another_teachers_meeting(client, world):
    headers = auth(client, "teacher_a@test.com")
    res = client.get(f"/meetings/{world['meeting_b'].id}", headers=headers)
    assert res.status_code == 404


def test_teacher_cannot_hijack_another_teachers_meeting(client, world):
    headers = auth(client, "teacher_a@test.com")
    res = client.patch(
        f"/meetings/{world['meeting_b'].id}",
        headers=headers,
        json={"join_url": "https://phishing.example.com"},
    )
    assert res.status_code == 404
    assert world["meeting_b"].join_url == "https://example.com/b"


def test_teacher_cannot_create_a_meeting_on_another_teachers_schedule(client, world):
    headers = auth(client, "teacher_a@test.com")
    res = client.post(
        "/meetings",
        headers=headers,
        json={
            "schedule_id": world["schedule_b"].id,
            "provider": "manual",
            "start_time": "2026-08-01T10:00:00Z",
            "join_url": "https://intruder.example.com",
        },
    )
    assert res.status_code == 403


def test_teacher_cannot_delete_another_teachers_meeting(client, world):
    headers = auth(client, "teacher_a@test.com")
    res = client.delete(f"/meetings/{world['meeting_b'].id}", headers=headers)
    assert res.status_code == 404


def test_teacher_can_manage_their_own_meeting(client, world):
    headers = auth(client, "teacher_a@test.com")
    res = client.patch(
        f"/meetings/{world['meeting_a'].id}",
        headers=headers,
        json={"join_url": "https://example.com/a-updated"},
    )
    assert res.status_code == 200
    assert res.json()["join_url"] == "https://example.com/a-updated"


def test_teacher_can_create_a_meeting_on_their_own_schedule(client, world):
    headers = auth(client, "teacher_a@test.com")
    res = client.post(
        "/meetings",
        headers=headers,
        json={
            "schedule_id": world["schedule_a"].id,
            "provider": "manual",
            "start_time": "2026-08-01T10:00:00Z",
            "join_url": "https://example.com/new",
        },
    )
    assert res.status_code == 201


# ---------------- Admin ----------------
def test_admin_sees_every_meeting_with_host_urls(client, world):
    headers = auth(client, "admin@test.com")
    body = client.get("/meetings", headers=headers).json()
    assert len(body) == 2
    assert all(m["host_url"] is not None for m in body)


def test_admin_can_edit_any_meeting(client, world):
    headers = auth(client, "admin@test.com")
    res = client.patch(
        f"/meetings/{world['meeting_b'].id}",
        headers=headers,
        json={"join_url": "https://example.com/b-fixed"},
    )
    assert res.status_code == 200
