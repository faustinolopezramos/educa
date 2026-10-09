"""Lo que el superadmin necesita para administrar academias desde la pantalla."""

from datetime import timedelta

from app.core.security import hash_password
from app.models import Course, Enrollment, EnrollmentStatus, Language, Level, Tenant, User, UserRole
from app.services.sequences import next_enrollment_code
from tests.conftest import TODAY, auth


def _user(db, email, role, tenant=None, **kw):
    u = User(
        email=email,
        full_name=email.split("@")[0],
        role=role,
        password_hash=hash_password("secret123"),
        tenant_id=tenant.id if tenant else None,
        **kw,
    )
    db.add(u)
    db.flush()
    return u


def _root(client, db):
    _user(db, "root@educa.com", UserRole.superadmin)
    return auth(client, "root@educa.com")


def test_the_list_shows_usage_against_the_plan(client, db):
    tenant = Tenant(name="Alfa", slug="alfa", max_active_students=5)
    empty = Tenant(name="Beta", slug="beta", max_active_students=5)
    db.add_all([tenant, empty])
    db.flush()
    _user(db, "admin@alfa.com", UserRole.admin, tenant)
    _user(db, "old@alfa.com", UserRole.admin, tenant, is_active=False)
    language = Language(name="Inglés", tenant_id=tenant.id)
    db.add(language)
    db.flush()
    level = Level(language_id=language.id, code="A1", name="A1")
    db.add(level)
    db.flush()
    course = Course(
        level_id=level.id, name="C", tenant_id=tenant.id,
        start_date=TODAY, end_date=TODAY + timedelta(days=30),
    )
    db.add(course)
    db.flush()
    for n, status in enumerate([EnrollmentStatus.active, EnrollmentStatus.enrolled, EnrollmentStatus.graduated]):
        s = _user(db, f"s{n}@alfa.com", UserRole.student, tenant)
        db.add(Enrollment(student_id=s.id, course_id=course.id, status=status,
                          enrollment_code=next_enrollment_code(db, year=TODAY.year)))
    db.flush()

    rows = {t["slug"]: t for t in client.get("/tenants", headers=_root(client, db)).json()}
    # Graduated holds no seat, the same rule the quota enforces.
    assert rows["alfa"]["active_students"] == 2
    assert rows["alfa"]["admins"] == 1  # the deactivated one does not run anything
    assert rows["alfa"]["active_users"] == 4
    assert rows["beta"] == rows["beta"] | {"active_students": 0, "admins": 0, "active_users": 0}


def test_the_superadmin_gives_a_new_academy_its_first_admin(client, db):
    root = _root(client, db)
    tenant = client.post(
        "/tenants", headers=root,
        json={"name": "Nueva", "slug": "nueva", "timezone": "America/Mexico_City"},
    ).json()
    assert client.get(f"/tenants/{tenant['id']}/admins", headers=root).json() == []

    res = client.post(
        "/users", headers=root,
        json={
            "email": "dir@nueva.com", "full_name": "Directora", "role": "admin",
            "cui_passport": "A1234567", "password": "temporal123",
            "tenant_id": tenant["id"], "timezone": "America/Mexico_City",
        },
    )
    assert res.status_code == 201, res.text
    [admin] = client.get(f"/tenants/{tenant['id']}/admins", headers=root).json()
    assert admin["email"] == "dir@nueva.com"
    # And that admin lands inside their academy.
    assert auth(client, "dir@nueva.com", "temporal123")


def test_an_unknown_timezone_is_refused(client, db):
    root = _root(client, db)
    res = client.post("/tenants", headers=root, json={"name": "X", "slug": "x", "timezone": "Mars/Olympus"})
    assert res.status_code == 422
    tenant = client.post("/tenants", headers=root, json={"name": "X", "slug": "x"}).json()
    assert client.patch(f"/tenants/{tenant['id']}", headers=root, json={"timezone": "Nope"}).status_code == 422


def test_an_academy_admin_cannot_list_another_academys_admins(client, db):
    tenant = Tenant(name="Alfa", slug="alfa")
    db.add(tenant)
    db.flush()
    _user(db, "admin@alfa.com", UserRole.admin, tenant)
    headers = auth(client, "admin@alfa.com")
    assert client.get(f"/tenants/{tenant.id}/admins", headers=headers).status_code == 403


def test_a_superadmin_must_place_new_users_in_an_academy(client, db):
    """Un admin sin academia vería todas: `apply_tenant` no filtra a quien no
    tiene `tenant_id`. El superadmin tiene que decir de cuál es."""
    tenant = Tenant(name="Gamma", slug="gamma", max_active_students=5)
    db.add(tenant)
    db.flush()
    root = _root(client, db)
    payload = {
        "email": "nuevo-admin@gamma.com",
        "full_name": "Nuevo Admin",
        "role": "admin",
        "cui_passport": "12345678",
    }

    assert client.post("/users", json=payload, headers=root).status_code == 422

    res = client.post("/users", json={**payload, "tenant_id": tenant.id}, headers=root)
    assert res.status_code == 201, res.text
    assert res.json()["tenant_id"] == tenant.id


def test_a_student_in_two_courses_holds_one_place_of_the_plan(client, db):
    tenant = Tenant(name="Delta", slug="delta", max_active_students=1)
    db.add(tenant)
    db.flush()
    admin = _user(db, "admin@delta.com", UserRole.admin, tenant)
    student = _user(db, "s@delta.com", UserRole.student, tenant)
    other = _user(db, "o@delta.com", UserRole.student, tenant)
    language = Language(name="Inglés", tenant_id=tenant.id)
    db.add(language)
    db.flush()
    level = Level(language_id=language.id, code="A1", name="A1")
    db.add(level)
    db.flush()
    from app.models import CourseStatus

    courses = []
    for name in ("Uno", "Dos"):
        c = Course(
            level_id=level.id, name=name, tenant_id=tenant.id, max_students=10,
            start_date=TODAY, end_date=TODAY + timedelta(days=30),
            status=CourseStatus.open,
        )
        db.add(c)
        courses.append(c)
    db.flush()
    headers = auth(client, admin.email)

    for course in courses:
        res = client.post(
            "/enrollments",
            json={"student_id": student.id, "course_id": course.id},
            headers=headers,
        )
        assert res.status_code == 201, res.text

    # El plan es de un alumno, y ya lo ocupa: otro distinto no cabe.
    res = client.post(
        "/enrollments",
        json={"student_id": other.id, "course_id": courses[0].id},
        headers=headers,
    )
    assert res.status_code == 409
    assert res.json()["detail"]["reason"] == "tenant_quota_exceeded"

    rows = {t["slug"]: t for t in client.get("/tenants", headers=_root(client, db)).json()}
    assert rows["delta"]["active_students"] == 1
