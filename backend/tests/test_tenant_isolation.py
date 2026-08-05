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
    Assignment,
    Attendance,
    AttendanceStatus,
    ClassSession,
    Course,
    CourseEvaluation,
    CourseTeacher,
    Enrollment,
    Grade,
    Language,
    Level,
    MeetingProvider,
    ProviderName,
    Room,
    Schedule,
    Tenant,
    User,
    UserRole,
)
from app.services.sequences import next_enrollment_code
from tests.conftest import TODAY, auth


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

    term_start = TODAY
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
        enrollment_code=next_enrollment_code(db, year=TODAY.year),
    )
    db.add(enrollment)
    db.flush()

    # One concrete class day, plus the academic records that hang off it. These
    # exist so the probes below have something real to leak: an endpoint that is
    # not scoped returns *these rows* to the other academy's admin.
    monday = term_start + timedelta(days=(0 - term_start.weekday()) % 7)
    session = ClassSession(schedule_id=schedule.id, date=monday)
    db.add(session)
    db.flush()

    grade = Grade(
        enrollment_id=enrollment.id,
        session_id=session.id,
        evaluation_name=f"Nota {slug}",
        score=9.0,
    )
    attendance = Attendance(
        enrollment_id=enrollment.id,
        session_id=session.id,
        status=AttendanceStatus.present,
    )
    evaluation = CourseEvaluation(
        course_id=course.id, name=f"Examen {slug}", weight=1.0
    )
    assignment = Assignment(
        course_id=course.id, tenant_id=tenant.id, title=f"Tarea {slug}"
    )
    provider = MeetingProvider(
        tenant_id=tenant.id, name=ProviderName.manual, is_active=True
    )
    db.add_all([grade, attendance, evaluation, assignment, provider])
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
        "session": session,
        "grade": grade,
        "attendance": attendance,
        "evaluation": evaluation,
        "assignment": assignment,
        "provider": provider,
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


# ---------------------------------------------------------------------------
# The academic record: grades, attendance, assignments, certificates.
#
# The scoping above was added for users, catalog, timetable, enrolments, finance
# and audit. Everything below was built afterwards and never scoped at all, so
# these are the same leak in newer rooms of the same house.
# ---------------------------------------------------------------------------
def test_grades_are_per_academy(client, academies):
    """A bare `select(Grade)` for an admin: every grade, of every academy."""
    headers = auth(client, "admin@alfa.com")

    rows = client.get("/grades", headers=headers).json()
    names = [g["evaluation_name"] for g in rows]
    assert "Nota alfa" in names
    assert "Nota beta" not in names

    foreign = academies["b"]["enrollment"].id
    assert client.get(f"/grades?enrollment_id={foreign}", headers=headers).json() == []


def test_another_academys_grade_cannot_be_written(client, academies):
    headers = auth(client, "admin@alfa.com")
    foreign_enrollment = academies["b"]["enrollment"].id
    foreign_grade = academies["b"]["grade"].id

    created = client.post(
        "/grades",
        headers=headers,
        json={
            "enrollment_id": foreign_enrollment,
            "evaluation_name": "Intruso",
            "score": 1.0,
        },
    )
    assert created.status_code == 404

    assert (
        client.patch(
            f"/grades/{foreign_grade}", headers=headers, json={"score": 1.0}
        ).status_code
        == 404
    )
    assert client.delete(f"/grades/{foreign_grade}", headers=headers).status_code == 404


def test_attendance_is_per_academy(client, academies):
    headers = auth(client, "admin@alfa.com")
    own = academies["a"]["enrollment"].id
    foreign = academies["b"]["enrollment"].id

    rows = client.get("/attendance", headers=headers).json()
    assert {r["enrollment_id"] for r in rows} == {own}
    foreign_rows = client.get(f"/attendance?enrollment_id={foreign}", headers=headers)
    assert foreign_rows.json() == []


def test_another_academys_attendance_cannot_be_written(client, academies):
    headers = auth(client, "admin@alfa.com")
    foreign_mark = academies["b"]["attendance"].id

    created = client.post(
        "/attendance",
        headers=headers,
        json={
            "enrollment_id": academies["b"]["enrollment"].id,
            "session_id": academies["b"]["session"].id,
            "status": "absent",
        },
    )
    assert created.status_code == 404

    assert (
        client.patch(
            f"/attendance/{foreign_mark}", headers=headers, json={"status": "absent"}
        ).status_code
        == 404
    )
    assert (
        client.delete(f"/attendance/{foreign_mark}", headers=headers).status_code == 404
    )


def test_assignments_are_per_academy(client, academies):
    headers = auth(client, "admin@alfa.com")
    titles = [a["title"] for a in client.get("/assignments", headers=headers).json()]
    assert titles == ["Tarea alfa"]


def test_another_academys_course_cannot_receive_an_assignment(client, academies):
    headers = auth(client, "admin@alfa.com")
    res = client.post(
        "/assignments",
        headers=headers,
        json={"course_id": academies["b"]["course"].id, "title": "Intrusa"},
    )
    assert res.status_code == 404


def test_another_academys_submissions_and_roster_stay_hidden(client, academies):
    """The roster carries student names, submission text, scores and feedback."""
    headers = auth(client, "admin@alfa.com")
    foreign = academies["b"]["assignment"].id

    for path in ("submissions", "roster-status"):
        res = client.get(f"/assignments/{foreign}/{path}", headers=headers)
        assert res.status_code == 404, path


def test_a_teacher_cannot_post_an_assignment_to_a_course_they_do_not_teach(
    client, academies, db
):
    """Within one academy too: assignment creation checked neither tenant nor
    whether the teacher actually teaches the course."""
    other_course = Course(
        level_id=academies["a"]["course"].level_id,
        name="Curso ajeno alfa",
        max_students=5,
        tenant_id=academies["a"]["tenant"].id,
    )
    db.add(other_course)
    db.flush()

    headers = auth(client, "teacher@alfa.com")
    res = client.post(
        "/assignments",
        headers=headers,
        json={"course_id": other_course.id, "title": "No la imparto"},
    )
    assert res.status_code == 403


def test_evaluation_weights_are_per_academy(client, academies):
    headers = auth(client, "admin@alfa.com")
    foreign_course = academies["b"]["course"].id
    foreign_eval = academies["b"]["evaluation"].id

    assert (
        client.get(
            f"/catalog/courses/{foreign_course}/evaluations", headers=headers
        ).status_code
        == 404
    )
    assert (
        client.post(
            f"/catalog/courses/{foreign_course}/evaluations",
            headers=headers,
            json={"name": "Intrusa", "weight": 5.0},
        ).status_code
        == 404
    )
    assert (
        client.delete(
            f"/catalog/courses/{foreign_course}/evaluations/{foreign_eval}",
            headers=headers,
        ).status_code
        == 404
    )


def test_a_certificate_cannot_be_issued_for_another_academys_student(client, academies):
    """Every *read* path in grading.py went through `_visible_enrollment`; the
    one that mints a certificate used a bare `db.get`."""
    headers = auth(client, "admin@alfa.com")
    foreign = academies["b"]["enrollment"].id

    assert (
        client.post(f"/enrollments/{foreign}/certificate", headers=headers).status_code
        == 404
    )
    assert (
        client.get(f"/enrollments/{foreign}/final-grade", headers=headers).status_code
        == 404
    )


# ---------------------------------------------------------------------------
# The live classroom.
# ---------------------------------------------------------------------------
def test_another_academys_lobby_hands_out_no_link(client, academies):
    """`lobby-info` granted `is_host` on role alone, and with it the host URL —
    for any session id in the installation."""
    headers = auth(client, "admin@alfa.com")
    foreign_session = academies["b"]["session"].id
    res = client.get(f"/meetings/session/{foreign_session}/lobby-info", headers=headers)
    assert res.status_code == 404


def test_no_meeting_can_be_attached_to_another_academys_schedule(client, academies):
    headers = auth(client, "admin@alfa.com")
    res = client.post(
        "/meetings",
        headers=headers,
        json={
            "schedule_id": academies["b"]["schedule"].id,
            "provider": "manual",
            "start_time": "2030-01-07T09:00:00+00:00",
            "join_url": "https://example.com/intruso",
        },
    )
    assert res.status_code == 404


# ---------------------------------------------------------------------------
# Teacher qualifications and availability.
# ---------------------------------------------------------------------------
def test_teacher_directory_is_per_academy(client, academies):
    headers = auth(client, "admin@alfa.com")
    ids = {t["id"] for t in client.get("/teachers", headers=headers).json()}
    assert academies["a"]["teacher"].id in ids
    assert academies["b"]["teacher"].id not in ids


def test_another_academys_teacher_qualifications_are_not_readable_or_writable(
    client, academies
):
    headers = auth(client, "admin@alfa.com")
    foreign_teacher = academies["b"]["teacher"].id

    assert (
        client.get(
            f"/teachers/{foreign_teacher}/languages", headers=headers
        ).status_code
        == 404
    )
    assert (
        client.put(
            f"/teachers/{foreign_teacher}/languages",
            headers=headers,
            json={"language_ids": []},
        ).status_code
        == 404
    )
    assert (
        client.get(
            f"/teachers/{foreign_teacher}/availability", headers=headers
        ).status_code
        == 404
    )
    assert (
        client.post(
            f"/teachers/{foreign_teacher}/availability",
            headers=headers,
            json={"day_of_week": 1, "start_time": "08:00", "end_time": "09:00"},
        ).status_code
        == 404
    )


def test_a_teacher_cannot_be_qualified_in_another_academys_language(client, academies):
    headers = auth(client, "admin@alfa.com")
    res = client.put(
        f"/teachers/{academies['a']['teacher'].id}/languages",
        headers=headers,
        json={"language_ids": [academies["b"]["language"].id]},
    )
    assert res.status_code == 404


def test_conflict_probing_does_not_reveal_another_academys_timetable(client, academies):
    """`check-conflict` echoes back course *names* for whatever it clashes with,
    which turns it into a read of another academy's schedule."""
    headers = auth(client, "admin@alfa.com")
    res = client.post(
        "/schedules/check-conflict",
        headers=headers,
        json={
            "teacher_id": academies["b"]["teacher"].id,
            "day_of_week": 0,
            "start_time": "09:00",
            "end_time": "10:00",
        },
    )
    # Either refused outright, or answered with nothing of academy B in it.
    if res.status_code == 200:
        leaked = res.json()["conflicts"] + res.json()["room_conflicts"]
        assert not [c for c in leaked if "beta" in c["course_name"]]
    else:
        assert res.status_code == 404


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
