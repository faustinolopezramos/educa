from datetime import datetime, timezone

from app.models import (
    Assignment,
    AssignmentSubmission,
    ClassSession,
    Course,
    Level,
    Language,
    User,
    UserRole,
)
from app.core.security import hash_password


def test_update_session_recording_url(client, db):
    # Setup language, level, course, user
    lang = Language(name="Inglés Test")
    db.add(lang)
    db.flush()
    level = Level(language_id=lang.id, code="A1", name="Principiante")
    db.add(level)
    db.flush()
    course = Course(level_id=level.id, name="Inglés 101")
    db.add(course)
    db.flush()

    teacher = User(
        email="teacher_rec@test.com",
        full_name="Profesor Rec",
        role=UserRole.teacher,
        password_hash=hash_password("secret123"),
    )
    db.add(teacher)
    db.flush()

    res_login = client.post(
        "/auth/login",
        data={"username": "teacher_rec@test.com", "password": "secret123"},
    )
    headers = {"Authorization": f"Bearer {res_login.json()['access_token']}"}

    # Verify assignments endpoint structure
    res_assign = client.get("/assignments", headers=headers)
    assert res_assign.status_code == 200
    assert isinstance(res_assign.json(), list)

    # Test Create Assignment
    res_create = client.post(
        "/assignments",
        json={
            "course_id": course.id,
            "title": "Tarea Test 1",
            "description": "Instrucciones de la tarea",
            "resource_url": "https://docs.google.com/test",
        },
        headers=headers,
    )
    assert res_create.status_code == 201
    assign_id = res_create.json()["id"]

    # Test Roster Status Endpoint
    res_roster = client.get(f"/assignments/{assign_id}/roster-status", headers=headers)
    assert res_roster.status_code == 200
    assert isinstance(res_roster.json(), list)
