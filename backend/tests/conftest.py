"""Test fixtures: an API client wired to a disposable Postgres database.

The schema relies on Postgres-only features (GiST exclusion constraints, native
ENUMs), so tests run against a real `educa_test` database rather than SQLite.
Create it once with:

    docker exec educa_postgres psql -U educa -d educa -c "CREATE DATABASE educa_test OWNER educa"
    DATABASE_URL=postgresql+psycopg://educa:educa@localhost:5432/educa_test alembic upgrade head

Each test runs inside a transaction that is rolled back afterwards, so tests
never see each other's rows and the database stays clean.
"""

from __future__ import annotations

import os
from datetime import date, datetime, time, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import hash_password
from app.main import app
from app.models import (
    Course,
    CourseTeacher,
    Enrollment,
    Language,
    Level,
    MeetingProvider,
    ProviderName,
    Schedule,
    User,
    UserRole,
    VirtualMeeting,
)

TEST_DATABASE_URL = os.getenv(
    "TEST_DATABASE_URL",
    "postgresql+psycopg://educa:educa@localhost:5432/educa_test",
)


@pytest.fixture(scope="session")
def engine():
    eng = create_engine(TEST_DATABASE_URL)
    yield eng
    eng.dispose()


@pytest.fixture
def db(engine) -> Session:
    """A session whose work is rolled back when the test ends.

    `join_transaction_mode="create_savepoint"` lets the code under test call
    `commit()` normally: those commits become savepoints inside the outer
    transaction we roll back here.
    """
    connection = engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection, join_transaction_mode="create_savepoint")
    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()


@pytest.fixture
def client(db: Session) -> TestClient:
    app.dependency_overrides[get_db] = lambda: db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


# ---------------- Factories ----------------
def make_user(db: Session, email: str, role: UserRole, password: str = "secret123") -> User:
    user = User(
        email=email,
        full_name=f"Test {role.value}",
        role=role,
        password_hash=hash_password(password),
    )
    db.add(user)
    db.flush()
    return user


def auth(client: TestClient, email: str, password: str = "secret123") -> dict[str, str]:
    res = client.post("/auth/login", data={"username": email, "password": password})
    assert res.status_code == 200, res.text
    return {"Authorization": f"Bearer {res.json()['access_token']}"}


@pytest.fixture
def world(db: Session):
    """Two teachers, each with their own course, schedule and meeting.

    `student` is enrolled in teacher_a's course only, which makes teacher_b's
    course and meeting the "someone else's data" the authorization tests probe.
    """
    admin = make_user(db, "admin@test.com", UserRole.admin)
    teacher_a = make_user(db, "teacher_a@test.com", UserRole.teacher)
    teacher_b = make_user(db, "teacher_b@test.com", UserRole.teacher)
    student = make_user(db, "student@test.com", UserRole.student)
    outsider = make_user(db, "outsider@test.com", UserRole.student)

    manual = MeetingProvider(name=ProviderName.manual, is_active=True)
    db.add(manual)

    language = Language(name="Inglés")
    db.add(language)
    db.flush()
    level = Level(language_id=language.id, code="A1", name="A1")
    db.add(level)
    db.flush()

    term_start, term_end = date.today(), date.today() + timedelta(days=90)
    course_a = Course(
        level_id=level.id, name="Curso A", max_students=10,
        start_date=term_start, end_date=term_end,
    )
    course_b = Course(
        level_id=level.id, name="Curso B", max_students=10,
        start_date=term_start, end_date=term_end,
    )
    db.add_all([course_a, course_b])
    db.flush()

    # Each teacher is assigned to their own course (the prerequisite for a slot).
    db.add_all([
        CourseTeacher(course_id=course_a.id, teacher_id=teacher_a.id, is_lead=True),
        CourseTeacher(course_id=course_b.id, teacher_id=teacher_b.id, is_lead=True),
    ])
    db.flush()

    schedule_a = Schedule(
        course_id=course_a.id, teacher_id=teacher_a.id, day_of_week=0,
        start_time=time(9, 0), end_time=time(10, 0),
        term_start=term_start, term_end=term_end,
    )
    schedule_b = Schedule(
        course_id=course_b.id, teacher_id=teacher_b.id, day_of_week=1,
        start_time=time(11, 0), end_time=time(12, 0),
        term_start=term_start, term_end=term_end,
    )
    db.add_all([schedule_a, schedule_b])
    db.flush()

    enrollment = Enrollment(student_id=student.id, course_id=course_a.id)
    db.add(enrollment)
    db.flush()

    start = datetime.now(timezone.utc) + timedelta(minutes=30)
    meeting_a = VirtualMeeting(
        schedule_id=schedule_a.id, provider_id=manual.id,
        join_url="https://example.com/a", host_url="https://example.com/a?host=1",
        start_time=start, end_time=start + timedelta(hours=1),
    )
    meeting_b = VirtualMeeting(
        schedule_id=schedule_b.id, provider_id=manual.id,
        join_url="https://example.com/b", host_url="https://example.com/b?host=1",
        start_time=start, end_time=start + timedelta(hours=1),
    )
    db.add_all([meeting_a, meeting_b])
    db.flush()

    return {
        "admin": admin,
        "teacher_a": teacher_a,
        "teacher_b": teacher_b,
        "student": student,
        "outsider": outsider,
        "course_a": course_a,
        "course_b": course_b,
        "schedule_a": schedule_a,
        "schedule_b": schedule_b,
        "enrollment": enrollment,
        "meeting_a": meeting_a,
        "meeting_b": meeting_b,
    }
