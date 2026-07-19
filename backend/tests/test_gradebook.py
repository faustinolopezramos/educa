"""Attendance and grades: one row per fact, now keyed by class session.

Both endpoints used to append on every call, so a teacher correcting a mark or
re-scoring an evaluation silently left the old row behind. Nothing surfaced it:
the gradebook renders the *first* match while the student's average counts
*every* match, so the two roles saw different numbers for the same student.
These tests pin the rule that makes that impossible, now that the unit is a
session (a dated class) rather than a bare date.
"""

import pytest

from tests.conftest import auth


@pytest.fixture
def session_a(client, world):
    """A concrete class session of course_a (teacher_a's Monday class)."""
    headers = auth(client, "admin@test.com")
    res = client.post(
        "/sessions/generate", headers=headers, json={"schedule_id": world["schedule_a"].id}
    )
    assert res.status_code == 200, res.text
    return res.json()[0]


# ---------------- Attendance: one mark per session ----------------
def test_correcting_a_mark_updates_it_instead_of_adding_a_second_row(
    client, world, session_a
):
    headers = auth(client, "teacher_a@test.com")
    enrollment_id = world["enrollment"].id
    base = {"enrollment_id": enrollment_id, "session_id": session_a["id"]}

    first = client.post("/attendance", headers=headers, json={**base, "status": "present"})
    assert first.status_code == 201, first.text
    second = client.post("/attendance", headers=headers, json={**base, "status": "late"})
    assert second.status_code == 200, "correcting an existing mark is not a creation"
    assert second.json()["id"] == first.json()["id"]

    rows = client.get(
        f"/attendance?enrollment_id={enrollment_id}", headers=headers
    ).json()
    assert len(rows) == 1
    assert rows[0]["status"] == "late"
    assert rows[0]["date"] == session_a["date"], "the read still carries the class day"


def test_marking_different_sessions_creates_separate_rows(client, world):
    headers = auth(client, "admin@test.com")
    sessions = client.post(
        "/sessions/generate", headers=headers, json={"schedule_id": world["schedule_a"].id}
    ).json()
    assert len(sessions) >= 2
    t = auth(client, "teacher_a@test.com")
    for s in sessions[:2]:
        res = client.post(
            "/attendance",
            headers=t,
            json={"enrollment_id": world["enrollment"].id, "session_id": s["id"], "status": "present"},
        )
        assert res.status_code == 201
    rows = client.get(
        f"/attendance?enrollment_id={world['enrollment'].id}", headers=t
    ).json()
    assert len(rows) == 2


def test_a_student_cannot_be_marked_for_another_courses_session(client, world):
    """session_b belongs to course_b; the enrollment is in course_a."""
    headers = auth(client, "admin@test.com")
    session_b = client.post(
        "/sessions/generate", headers=headers, json={"schedule_id": world["schedule_b"].id}
    ).json()[0]
    res = client.post(
        "/attendance",
        headers=headers,
        json={"enrollment_id": world["enrollment"].id, "session_id": session_b["id"], "status": "present"},
    )
    assert res.status_code == 400


# ---------------- Grades ----------------
def test_regrading_a_course_level_evaluation_overwrites_the_score(client, world):
    """Exam/final grade: no session, one score per named evaluation."""
    headers = auth(client, "teacher_a@test.com")
    enrollment_id = world["enrollment"].id
    exam = {"enrollment_id": enrollment_id, "evaluation_name": "Examen final"}

    first = client.post("/grades", headers=headers, json={**exam, "score": 7.0})
    assert first.status_code == 201
    second = client.post("/grades", headers=headers, json={**exam, "score": 9.0})
    assert second.status_code == 200
    assert second.json()["id"] == first.json()["id"]

    rows = client.get(f"/grades?enrollment_id={enrollment_id}", headers=headers).json()
    assert len(rows) == 1 and rows[0]["score"] == 9.0
    assert rows[0]["session_id"] is None


def test_a_session_grade_and_a_course_grade_coexist(client, world, session_a):
    """Same evaluation name, one tied to a day and one course-level, are distinct."""
    headers = auth(client, "teacher_a@test.com")
    enrollment_id = world["enrollment"].id
    r1 = client.post(
        "/grades",
        headers=headers,
        json={"enrollment_id": enrollment_id, "evaluation_name": "Participación", "score": 8, "session_id": session_a["id"]},
    )
    r2 = client.post(
        "/grades",
        headers=headers,
        json={"enrollment_id": enrollment_id, "evaluation_name": "Participación", "score": 6},
    )
    assert r1.status_code == 201 and r2.status_code == 201
    rows = client.get(f"/grades?enrollment_id={enrollment_id}", headers=headers).json()
    assert len(rows) == 2


def test_regrading_the_same_session_evaluation_overwrites(client, world, session_a):
    headers = auth(client, "teacher_a@test.com")
    enrollment_id = world["enrollment"].id
    base = {
        "enrollment_id": enrollment_id,
        "evaluation_name": "Participación",
        "session_id": session_a["id"],
    }
    first = client.post("/grades", headers=headers, json={**base, "score": 5})
    second = client.post("/grades", headers=headers, json={**base, "score": 10})
    assert first.status_code == 201 and second.status_code == 200
    assert second.json()["id"] == first.json()["id"]


# ---------------- Authorization still holds ----------------
def test_a_teacher_cannot_grade_a_course_they_do_not_teach(client, world):
    headers = auth(client, "teacher_b@test.com")
    res = client.post(
        "/grades",
        headers=headers,
        json={"enrollment_id": world["enrollment"].id, "evaluation_name": "Examen 1", "score": 10},
    )
    assert res.status_code == 403


def test_a_teacher_cannot_mark_attendance_for_another_course(client, world, session_a):
    headers = auth(client, "teacher_b@test.com")
    res = client.post(
        "/attendance",
        headers=headers,
        json={"enrollment_id": world["enrollment"].id, "session_id": session_a["id"], "status": "present"},
    )
    assert res.status_code == 403
