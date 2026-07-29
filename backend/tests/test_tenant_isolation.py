"""One academy must never see, touch or count another academy's data.

The tenant tables existed and `/tenants` was guarded by role, but nothing scoped
the *data*: an admin of academy A could list, read, modify and delete the users
of academy B (200/200/200/204), and read its catalog, timetable, enrollments,
finances and audit trail. `test_multi_tenancy.py` passed throughout, because it
only ever asserted who may reach the `/tenants` router.

A superadmin is deliberately tenant-less and still sees everything; that is the
account that administers academies, and the last test here pins it down so the
scoping cannot be tightened into breaking it.
"""

from datetime import date, time, timedelta

import pytest

from app.core.security import hash_password
from app.models import (
    AcademicHoliday,
    Course,
    CourseTeacher,
    Enrollment,
    Language,
    Level,
    Room,
    Schedule,
    Tenant,
    User,
    UserRole,
)
from app.services.sequences import next_enrollment_code
from tests.conftest import auth


def _academy(db, slug: str) -> dict:
    """A self-contained academy: staff, catalog, room, holiday and one student."""
    tenant = Tenant(name=slug, slug=slug, max_active_students=100)
    db.add(tenant)
    db.flush()

    def user(role: UserRole, email: str) -> User:
        u = User(
            email=email,
            full_name=f"{role.value} {slug}",
            role=role,
            password_hash=hash_password("secret123"),
            tenant_id=tenant.id,
        )
        db.add(u)
        db.flush()
        return u

    admin = user(UserRole.admin, f"admin@{slug}.com")
    teacher = user(UserRole.teacher, f"teacher@{slug}.com")
    student = user(UserRole.student, f"student@{slug}.com")

    language = Language(name=f"Idioma {slug}", tenant_id=tenant.id)
    db.add(language)
    db.flush()
    level = Level(language_id=language.id, code="A1", name="A1")
    db.add(level)
    db.flush()

    term_start = date.today()
    term_end = term_start + timedelta(days=90)
    course = Course(
        level_id=level.id,
        name=f"Curso {slug}",
        max_students=10,
        start_date=term_start,
        end_date=term_end,
        tenant_id=tenant.id,
    )
    room = Room(name=f"Aula {slug}", tenant_id=tenant.id)
    holiday = AcademicHoliday(
        date=term_start + timedelta(days=5), name=f"Feriado {slug}", tenant_id=tenant.id
    )
    db.add_all([course, room, holiday])
    db.flush()

    db.add(CourseTeacher(course_id=course.id, teacher_id=teacher.id, is_lead=True))
    schedule = Schedule(
        course_id=course.id,
        teacher_id=teacher.id,
        day_of_week=0,
        start_time=time(9, 0),
        end_time=time(10, 0),
        term_start=term_start,
        term_end=term_end,
    )
    db.add(schedule)
    db.flush()

    enrollment = Enrollment(
        student_id=student.id,
        course_id=course.id,
        enrollment_code=next_enrollment_code(db, year=date.today().year),
    )
    db.add(enrollment)
    db.flush()

    return {
        "tenant": tenant,
        "admin": admin,
        "teacher": teacher,
        "student": student,
        "language": language,
        "course": course,
        "room": room,
        "holiday": holiday,
        "schedule": schedule,
        "enrollment": enrollment,
    }


@pytest.fixture
def academies(db):
    """Two complete, unrelated academies."""
    return {"a": _academy(db, "alfa"), "b": _academy(db, "beta")}


def test_an_admin_only_lists_users_of_their_own_academy(client, academies):
    headers = auth(client, "admin@alfa.com")
    emails = [u["email"] for u in client.get("/users", headers=headers).json()["items"]]

    assert "student@alfa.com" in emails
    assert not [e for e in emails if e.endswith("@beta.com")]


def test_another_academys_user_cannot_be_read_modified_or_deleted(client, academies):
    """The exact probe that exposed the leak: it answered 200/200/204."""
    headers = auth(client, "admin@alfa.com")
    victim = academies["b"]["student"].id

    assert client.get(f"/users/{victim}", headers=headers).status_code == 404
    assert (
        client.patch(
            f"/users/{victim}", json={"full_name": "Intruso"}, headers=headers
        ).status_code
        == 404
    )
    assert client.delete(f"/users/{victim}", headers=headers).status_code == 404


def test_the_catalog_is_per_academy(client, academies):
    headers = auth(client, "admin@alfa.com")

    languages = client.get("/catalog/languages", headers=headers).json()
    assert [lang["name"] for lang in languages] == ["Idioma alfa"]

    courses = client.get("/catalog/courses", headers=headers).json()
    assert [c["name"] for c in courses] == ["Curso alfa"]

    foreign_course = academies["b"]["course"].id
    assert (
        client.get(
            f"/catalog/courses/{foreign_course}/students", headers=headers
        ).status_code
        == 404
    )


def test_rooms_and_holidays_are_per_academy(client, academies):
    headers = auth(client, "admin@alfa.com")

    assert [r["name"] for r in client.get("/rooms", headers=headers).json()] == [
        "Aula alfa"
    ]
    assert [h["name"] for h in client.get("/holidays", headers=headers).json()] == [
        "Feriado alfa"
    ]

    foreign_room = academies["b"]["room"].id
    assert client.delete(f"/rooms/{foreign_room}", headers=headers).status_code == 404


def test_timetable_and_enrollments_are_per_academy(client, academies):
    headers = auth(client, "admin@alfa.com")

    schedules = client.get("/schedules", headers=headers).json()
    assert {s["course_id"] for s in schedules} == {academies["a"]["course"].id}

    enrollments = client.get("/enrollments", headers=headers).json()
    assert {e["course_id"] for e in enrollments} == {academies["a"]["course"].id}


def test_finance_is_per_academy(client, academies):
    """Money is the most sensitive of the lot and had no scoping at all."""
    headers = auth(client, "admin@alfa.com")
    foreign = academies["b"]["enrollment"].id

    assert (
        client.get(f"/enrollments/{foreign}/ledger", headers=headers).status_code == 404
    )
    assert (
        client.post(
            "/payments",
            headers=headers,
            json={"enrollment_id": foreign, "kind": "payment", "amount": 50.0},
        ).status_code
        == 404
    )
    assert (
        client.post(f"/enrollments/{foreign}/invoice", headers=headers).status_code
        == 404
    )


def test_the_audit_trail_is_per_academy(client, academies):
    """Both admins act; neither may read the other's trail."""
    a_headers = auth(client, "admin@alfa.com")
    b_headers = auth(client, "admin@beta.com")

    client.patch(
        f"/users/{academies['a']['student'].id}",
        json={"full_name": "Alumno Alfa Renombrado"},
        headers=a_headers,
    )
    client.patch(
        f"/users/{academies['b']['student'].id}",
        json={"full_name": "Alumno Beta Renombrado"},
        headers=b_headers,
    )

    rows = client.get("/audit?entity=user", headers=a_headers).json()["items"]
    assert rows
    changed_names = [r["after"]["full_name"] for r in rows]
    assert all("Beta" not in name for name in changed_names)


def test_reports_do_not_span_academies(client, academies):
    headers = auth(client, "admin@alfa.com")
    body = client.get("/reports?period=month", headers=headers).json()

    reported = {c["course_id"] for c in body["attendance_by_course"]}
    assert academies["b"]["course"].id not in reported


def test_a_superadmin_still_sees_every_academy(client, db):
    """Tenant-less on purpose — tightening the scope must not lock them out."""
    academy = _academy(db, "gamma")
    root = User(
        email="root@educa.com",
        full_name="Super Admin",
        role=UserRole.superadmin,
        password_hash=hash_password("secret123"),
        tenant_id=None,
    )
    db.add(root)
    db.flush()

    headers = auth(client, "root@educa.com")
    emails = [u["email"] for u in client.get("/users", headers=headers).json()["items"]]
    assert academy["student"].email in emails
