"""Planes de la academia: verlos, pedir uno mayor, y que el superadmin lo active.

Sin pasarela de pago: la academia solicita, el superadmin confirma el pago por
su cuenta y activa. Antes el plan elegido al registrarse se perdía en la
auditoría y nadie lo veía.
"""

from datetime import timedelta

from app.core.security import hash_password
from app.models import (
    Course,
    CourseStatus,
    Enrollment,
    EnrollmentStatus,
    Language,
    Level,
    Notification,
    Tenant,
    User,
    UserRole,
)
from app.services.sequences import next_enrollment_code
from tests.conftest import TODAY, auth


def _user(db, email, role, tenant=None):
    u = User(
        email=email,
        full_name=email.split("@")[0],
        role=role,
        password_hash=hash_password("secret123"),
        tenant_id=tenant.id if tenant else None,
    )
    db.add(u)
    db.flush()
    return u


def _academy(db, slug="plan-academia", max_students=15, plan="free"):
    tenant = Tenant(name=slug, slug=slug, max_active_students=max_students, plan_tier=plan)
    db.add(tenant)
    db.flush()
    admin = _user(db, f"admin@{slug}.com", UserRole.admin, tenant)
    return tenant, admin


def _course(db, tenant):
    language = Language(name=f"Inglés {tenant.slug}", tenant_id=tenant.id)
    db.add(language)
    db.flush()
    level = Level(language_id=language.id, code="A1", name="A1")
    db.add(level)
    db.flush()
    course = Course(
        level_id=level.id, name="Curso", tenant_id=tenant.id, max_students=50,
        start_date=TODAY, end_date=TODAY + timedelta(days=30), status=CourseStatus.open,
    )
    db.add(course)
    db.flush()
    return course


def _seat(db, tenant, course, n):
    for i in range(n):
        s = _user(db, f"s{i}@{tenant.slug}.com", UserRole.student, tenant)
        db.add(Enrollment(
            student_id=s.id, course_id=course.id, status=EnrollmentStatus.active,
            enrollment_code=next_enrollment_code(db, year=TODAY.year, tenant_id=tenant.id),
        ))
    db.flush()


def _notes(db, user, kind):
    return db.query(Notification).filter_by(recipient_id=user.id, kind=kind).all()


# ---------------- Lo que ve la academia ----------------


def test_the_catalog_is_public_and_in_quetzales(client):
    plans = {p["code"]: p for p in client.get("/academy/plans").json()}
    assert plans["starter"]["max_students"] == 100
    assert float(plans["starter"]["monthly_price"]) == 199
    assert float(plans["scale"]["monthly_price"]) == 999


def test_the_admin_sees_plan_and_usage(client, db):
    tenant, admin = _academy(db)
    _seat(db, tenant, _course(db, tenant), 4)

    res = client.get("/academy/plan", headers=auth(client, admin.email))
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["plan"] == "free"
    assert body["plan_name"] == "Gratis"
    assert body["active_students"] == 4
    assert body["max_active_students"] == 15
    assert body["requested_plan"] is None


def test_only_the_academy_admin_reaches_the_plan(client, db):
    tenant, _ = _academy(db)
    assistant = _user(db, "asist@plan.com", UserRole.assistant, tenant)
    teacher = _user(db, "prof@plan.com", UserRole.teacher, tenant)
    root = _user(db, "root@educa.com", UserRole.superadmin)

    assert client.get("/academy/plan", headers=auth(client, assistant.email)).status_code == 403
    assert client.get("/academy/plan", headers=auth(client, teacher.email)).status_code == 403
    # Un superadmin no tiene academia propia.
    assert client.get("/academy/plan", headers=auth(client, root.email)).status_code == 404


def test_requesting_a_plan_leaves_it_pending_and_tells_the_platform(client, db):
    tenant, admin = _academy(db)
    root = _user(db, "root@educa.com", UserRole.superadmin)
    headers = auth(client, admin.email)

    res = client.post("/academy/plan-request", json={"plan": "pro"}, headers=headers)
    assert res.status_code == 200, res.text
    assert res.json()["requested_plan"] == "pro"
    # Pedirlo no lo activa: el cupo sigue siendo el del gratuito.
    assert res.json()["max_active_students"] == 15
    assert len(_notes(db, root, "plan_request")) == 1

    res = client.delete("/academy/plan-request", headers=headers)
    assert res.status_code == 200
    assert res.json()["requested_plan"] is None


def test_a_request_must_be_a_real_different_plan_that_fits(client, db):
    tenant, admin = _academy(db, max_students=100, plan="starter")
    _seat(db, tenant, _course(db, tenant), 20)
    headers = auth(client, admin.email)

    assert client.post("/academy/plan-request", json={"plan": "oro"}, headers=headers).status_code == 422
    assert client.post("/academy/plan-request", json={"plan": "starter"}, headers=headers).status_code == 409
    # 20 alumnos no caben en el gratuito de 15.
    res = client.post("/academy/plan-request", json={"plan": "free"}, headers=headers)
    assert res.status_code == 409
    assert res.json()["detail"]["reason"] == "plan_too_small"


# ---------------- Lo que hace el superadmin ----------------


def test_activating_a_plan_raises_the_quota_and_tells_the_academy(client, db):
    tenant, admin = _academy(db)
    root = _user(db, "root@educa.com", UserRole.superadmin)
    client.post("/academy/plan-request", json={"plan": "pro"}, headers=auth(client, admin.email))

    res = client.post(
        f"/tenants/{tenant.id}/plan", json={"plan": "pro"}, headers=auth(client, root.email)
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["plan_tier"] == "pro"
    assert body["max_active_students"] == 300
    assert body["requested_plan"] is None
    assert len(_notes(db, admin, "plan_activated")) == 1


def test_an_academy_admin_cannot_activate_its_own_plan(client, db):
    tenant, admin = _academy(db)
    res = client.post(
        f"/tenants/{tenant.id}/plan", json={"plan": "scale"}, headers=auth(client, admin.email)
    )
    assert res.status_code == 403


def test_rejecting_a_request_clears_it_and_says_why(client, db):
    tenant, admin = _academy(db)
    root = _user(db, "root@educa.com", UserRole.superadmin)
    client.post("/academy/plan-request", json={"plan": "pro"}, headers=auth(client, admin.email))

    res = client.post(
        f"/tenants/{tenant.id}/plan-request/reject",
        json={"reason": "No recibimos el depósito"},
        headers=auth(client, root.email),
    )
    assert res.status_code == 200, res.text
    assert res.json()["requested_plan"] is None
    assert res.json()["max_active_students"] == 15
    [note] = _notes(db, admin, "plan_rejected")
    assert "No recibimos el depósito" in note.body


def test_editing_the_quota_by_hand_keeps_the_plan_honest(client, db):
    tenant, _ = _academy(db)
    root = _user(db, "root@educa.com", UserRole.superadmin)
    headers = auth(client, root.email)

    res = client.patch(f"/tenants/{tenant.id}", json={"max_active_students": 40}, headers=headers)
    assert res.json()["plan_tier"] is None  # a medida
    res = client.patch(f"/tenants/{tenant.id}", json={"max_active_students": 100}, headers=headers)
    assert res.json()["plan_tier"] == "starter"


# ---------------- Registro y avisos de cupo ----------------


def test_a_paid_plan_chosen_at_signup_waits_for_the_superadmin(client, db):
    root = _user(db, "root@educa.com", UserRole.superadmin)
    res = client.post(
        "/auth/register-academy",
        json={
            "academy_name": "Nueva",
            "slug": "nueva-pago",
            "admin_name": "Dueña",
            "admin_email": "duena@nueva.com",
            "password": "Password123!",
        "accept_terms": True,
            "plan_tier": "scale",
        },
    )
    assert res.status_code == 201, res.text
    tenant = db.query(Tenant).filter_by(slug="nueva-pago").one()
    assert tenant.plan_tier == "free"
    assert tenant.max_active_students == 15
    assert tenant.requested_plan == "scale"
    assert len(_notes(db, root, "plan_request")) == 1


def test_the_academy_is_warned_at_80_percent_and_at_the_limit(client, db):
    tenant, admin = _academy(db, max_students=5)
    course = _course(db, tenant)
    _seat(db, tenant, course, 3)
    headers = auth(client, admin.email)

    def enroll(n):
        s = _user(db, f"nuevo{n}@{tenant.slug}.com", UserRole.student, tenant)
        res = client.post(
            "/enrollments", json={"student_id": s.id, "course_id": course.id}, headers=headers
        )
        assert res.status_code == 201, res.text

    enroll(4)  # 4 de 5: cruza el 80 %
    assert len(_notes(db, admin, "plan_quota")) == 1
    enroll(5)  # 5 de 5: llega al límite
    notes = _notes(db, admin, "plan_quota")
    assert len(notes) == 2
    assert any("llegó al límite" in n.title for n in notes)
