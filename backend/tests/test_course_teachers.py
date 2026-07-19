"""Explicit teacher↔course assignment.

Assignment is now the source of truth for "who teaches this course": it gates
scheduling, and it — not the schedules — is what the grade/attendance/roster
authorization reads.
"""

from datetime import time

from app.models import Language, Level, Course, UserRole
from tests.conftest import auth, make_user


def _course_needing_a_teacher(db):
    lang = Language(name="Francés")
    db.add(lang)
    db.flush()
    level = Level(language_id=lang.id, code="A1", name="A1")
    db.add(level)
    db.flush()
    course = Course(level_id=level.id, name="Francés A1", max_students=10)
    db.add(course)
    db.flush()
    return course


def test_admin_assigns_and_lists_a_teacher(client, db):
    course = _course_needing_a_teacher(db)
    teacher = make_user(db, "fr_teacher@test.com", UserRole.teacher)
    headers = auth(client, make_admin_email(db))

    res = client.post(
        f"/catalog/courses/{course.id}/teachers",
        headers=headers,
        json={"teacher_id": teacher.id, "is_lead": True},
    )
    assert res.status_code == 201, res.text
    assert res.json()["teacher_name"] == teacher.full_name

    listed = client.get(f"/catalog/courses/{course.id}/teachers", headers=headers).json()
    assert [t["teacher_id"] for t in listed] == [teacher.id]


def test_assigning_a_non_teacher_is_rejected(client, db):
    course = _course_needing_a_teacher(db)
    student = make_user(db, "not_a_teacher@test.com", UserRole.student)
    headers = auth(client, make_admin_email(db))
    res = client.post(
        f"/catalog/courses/{course.id}/teachers",
        headers=headers,
        json={"teacher_id": student.id},
    )
    assert res.status_code == 400


def test_assigning_an_unqualified_teacher_is_blocked(client, db):
    """The teacher qualifies for English only; the course is French."""
    from app.models import TeacherLanguage

    course = _course_needing_a_teacher(db)
    english = Language(name="Inglés-fr-test")
    db.add(english)
    db.flush()
    teacher = make_user(db, "eng_only@test.com", UserRole.teacher)
    db.add(TeacherLanguage(teacher_id=teacher.id, language_id=english.id))
    db.flush()

    headers = auth(client, make_admin_email(db))
    res = client.post(
        f"/catalog/courses/{course.id}/teachers",
        headers=headers,
        json={"teacher_id": teacher.id},
    )
    assert res.status_code == 409
    assert res.json()["detail"]["reason"] == "qualification"


def test_a_teacher_cannot_be_scheduled_before_being_assigned(client, db, world):
    """Scheduling is downstream of assignment."""
    headers = auth(client, "admin@test.com")
    # teacher_b is not assigned to course_a.
    res = client.post(
        "/schedules",
        headers=headers,
        json={
            "course_id": world["course_a"].id,
            "teacher_id": world["teacher_b"].id,
            "day_of_week": 2,
            "start_time": "15:00:00",
            "end_time": "16:00:00",
        },
    )
    assert res.status_code == 409
    assert res.json()["detail"]["reason"] == "not_assigned"


def test_assigning_then_scheduling_works(client, db, world):
    headers = auth(client, "admin@test.com")
    client.post(
        f"/catalog/courses/{world['course_a'].id}/teachers",
        headers=headers,
        json={"teacher_id": world["teacher_b"].id},
    )
    res = client.post(
        "/schedules",
        headers=headers,
        json={
            "course_id": world["course_a"].id,
            "teacher_id": world["teacher_b"].id,
            "day_of_week": 2,
            "start_time": "15:00:00",
            "end_time": "16:00:00",
        },
    )
    assert res.status_code == 201, res.text


def test_a_teacher_with_a_schedule_cannot_be_unassigned(client, db, world):
    """teacher_a teaches course_a via schedule_a, so dropping the assignment
    would orphan that schedule."""
    headers = auth(client, "admin@test.com")
    res = client.delete(
        f"/catalog/courses/{world['course_a'].id}/teachers/{world['teacher_a'].id}",
        headers=headers,
    )
    assert res.status_code == 409


def test_grade_authorization_follows_assignment_not_schedules(client, db, world):
    """A teacher assigned to a course can grade it even with no schedule yet."""
    headers = auth(client, "admin@test.com")
    # Assign teacher_b to course_a but give them no schedule there.
    client.post(
        f"/catalog/courses/{world['course_a'].id}/teachers",
        headers=headers,
        json={"teacher_id": world["teacher_b"].id},
    )
    tb = auth(client, "teacher_b@test.com")
    res = client.post(
        "/grades",
        headers=tb,
        json={
            "enrollment_id": world["enrollment"].id,
            "evaluation_name": "Examen 1",
            "score": 8,
        },
    )
    assert res.status_code == 201, res.text


def make_admin_email(db) -> str:
    """A throwaway admin to authenticate as, unique per call."""
    import uuid

    email = f"admin_{uuid.uuid4().hex[:8]}@test.com"
    make_user(db, email, UserRole.admin)
    return email
