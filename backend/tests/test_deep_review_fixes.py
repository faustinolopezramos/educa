"""Hallazgos de la revisión a fondo de backend y frontend.

Cada bloque fija un comportamiento que estaba roto y que ninguna prueba tocaba
— por eso seguía roto. Los agrupa un solo archivo porque lo que tienen en común
es cómo se encontraron, no el módulo al que pertenecen.
"""

from datetime import date, timedelta

import pytest

from app.core.security import hash_password
from app.models import (
    Attendance,
    AttendanceStatus,
    ClassSession,
    Course,
    Enrollment,
    EnrollmentStatus,
    Language,
    Level,
    PaymentStatus,
    Tenant,
    User,
    UserRole,
)
from app.services.sequences import next_enrollment_code
from tests.conftest import TODAY, auth, make_user


# ---------------------------------------------------------------------------
# `Course.name`, no `Course.title`
# ---------------------------------------------------------------------------
def test_next_level_suggestion_answers_instead_of_crashing(client, world):
    headers = auth(client, "admin@test.com")
    res = client.get(
        f"/enrollments/{world['enrollment'].id}/next-level-suggestion", headers=headers
    )
    assert res.status_code == 200, res.text
    assert res.json()["current_course_title"] == world["course_a"].name


# ---------------------------------------------------------------------------
# El barrido de morosidad no puede salirse de su academia
# ---------------------------------------------------------------------------
def _academy(db, slug: str, *, with_overdue_enrollment: bool):
    """Una academia completa: tenant, admin y (opcional) una matrícula en mora.

    Con tenant de verdad, no como el `world`, cuyos usuarios no tienen ninguno
    — y un usuario sin academia opera a nivel de instalación por convención
    (`apply_tenant`), que es justo lo contrario de lo que se quiere probar aquí.
    """
    tenant = Tenant(name=f"Academia {slug}", slug=slug, max_active_students=100)
    db.add(tenant)
    db.flush()

    admin = User(
        email=f"admin_{slug}@test.com",
        full_name=f"Admin {slug}",
        role=UserRole.admin,
        password_hash=hash_password("secret123"),
        tenant_id=tenant.id,
    )
    db.add(admin)
    db.flush()
    if not with_overdue_enrollment:
        return {"tenant": tenant, "admin": admin, "enrollment": None}

    student = User(
        email=f"alumno_{slug}@test.com",
        full_name=f"Alumno {slug}",
        role=UserRole.student,
        password_hash=hash_password("secret123"),
        tenant_id=tenant.id,
    )
    language = Language(name=f"Idioma {slug}", tenant_id=tenant.id)
    db.add_all([student, language])
    db.flush()
    # `Level` no lleva tenant: llega a su academia a través del idioma.
    level = Level(language_id=language.id, code="A1", name="A1")
    db.add(level)
    db.flush()
    course = Course(
        level_id=level.id,
        name=f"Curso {slug}",
        max_students=10,
        tenant_id=tenant.id,
        start_date=TODAY,
        end_date=TODAY + timedelta(days=30),
    )
    db.add(course)
    db.flush()
    enrollment = Enrollment(
        student_id=student.id,
        course_id=course.id,
        enrollment_code=next_enrollment_code(db, year=TODAY.year),
        status=EnrollmentStatus.active,
        # Marcada en mora sin deber nada: cualquier recálculo la pasa a `paid`,
        # así que sirve de testigo de si alguien la tocó.
        payment_status=PaymentStatus.overdue,
        amount=0.0,
    )
    db.add(enrollment)
    db.flush()
    return {"tenant": tenant, "admin": admin, "enrollment": enrollment}


@pytest.fixture
def two_academies(db):
    """Dos academias con tenant propio; sólo la segunda tiene una matrícula."""
    return {
        "vecina": _academy(db, "vecina", with_overdue_enrollment=False),
        "lejana": _academy(db, "lejana", with_overdue_enrollment=True),
    }


def test_the_delinquency_sweep_stops_at_the_academys_border(client, db, two_academies):
    """Un admin sólo recalcula lo suyo.

    Sin ámbito, este barrido reescribía `payment_status` de todas las academias
    de la instalación y devolvía a quien lo llamó un recuento de filas ajenas.
    """
    foreign = two_academies["lejana"]["enrollment"]
    assert foreign.payment_status is PaymentStatus.overdue

    headers = auth(client, "admin_vecina@test.com")
    res = client.post("/payments/refresh-statuses", headers=headers)
    assert res.status_code == 200
    assert res.json()["updated"] == 0, "contó filas de otra academia"

    db.refresh(foreign)
    assert foreign.payment_status is PaymentStatus.overdue, (
        "el barrido de una academia reescribió la matrícula de otra"
    )


def test_each_academy_sweeps_its_own(client, db, two_academies):
    foreign = two_academies["lejana"]["enrollment"]
    headers = auth(client, "admin_lejana@test.com")
    res = client.post("/payments/refresh-statuses", headers=headers)
    assert res.status_code == 200
    db.refresh(foreign)
    # Su propio admin sí la recalcula: no debe nada, así que queda saldada.
    assert foreign.payment_status is PaymentStatus.paid


# ---------------------------------------------------------------------------
# Identificación personal: forma canónica y unicidad real
# ---------------------------------------------------------------------------
def _new_user_payload(**over):
    body = {
        "email": "nuevo@test.com",
        "full_name": "Persona Nueva",
        "role": "student",
        "password": "secret123",
        "cui_passport": "2450123450101",
    }
    body.update(over)
    return body


def test_the_document_is_stored_in_one_canonical_shape(client, world):
    headers = auth(client, "admin@test.com")
    res = client.post(
        "/users",
        json=_new_user_payload(cui_passport="2450 12345 0101"),
        headers=headers,
    )
    assert res.status_code == 201, res.text
    assert res.json()["cui_passport"] == "2450123450101"


@pytest.mark.parametrize(
    "second_form",
    ["2450 12345 0101", "2450-12345-0101", "  2450123450101  "],
)
def test_the_same_document_written_differently_is_still_a_duplicate(
    client, world, second_form
):
    """El fallo original: se comparaba la cadena cruda contra un valor que el
    formulario ya había maquetado, así que la misma persona entraba dos veces."""
    headers = auth(client, "admin@test.com")
    first = client.post(
        "/users", json=_new_user_payload(cui_passport="2450123450101"), headers=headers
    )
    assert first.status_code == 201

    second = client.post(
        "/users",
        json=_new_user_payload(email="otro@test.com", cui_passport=second_form),
        headers=headers,
    )
    assert second.status_code == 409, second.text


def test_a_passport_is_matched_regardless_of_case(client, world):
    headers = auth(client, "admin@test.com")
    assert (
        client.post(
            "/users", json=_new_user_payload(cui_passport="AB123456"), headers=headers
        ).status_code
        == 201
    )
    assert (
        client.post(
            "/users",
            json=_new_user_payload(email="otro@test.com", cui_passport="ab123456"),
            headers=headers,
        ).status_code
        == 409
    )


@pytest.mark.parametrize(
    "bad",
    [
        "123",  # por debajo del mínimo
        "A" * 26,  # por encima del máximo
        "   ",  # en blanco
        "----",  # sin nada alfanumérico que guardar
    ],
)
def test_the_document_format_is_enforced_by_the_api_not_only_the_form(
    client, world, bad
):
    """La regla vivía sólo en `frontend/src/lib/validation.ts`, así que cualquier
    llamada directa guardaba lo que quisiera en el campo de identidad."""
    headers = auth(client, "admin@test.com")
    res = client.post("/users", json=_new_user_payload(cui_passport=bad), headers=headers)
    assert res.status_code == 422, res.text


def test_two_academies_may_hold_the_same_document(client, db, world, two_academies):
    """La unicidad es por academia, no global: una persona puede estudiar en dos."""
    headers = auth(client, "admin@test.com")
    assert (
        client.post(
            "/users", json=_new_user_payload(cui_passport="2450123450101"), headers=headers
        ).status_code
        == 201
    )
    other = auth(client, "admin_vecina@test.com")
    assert (
        client.post(
            "/users",
            json=_new_user_payload(email="mismo@test.com", cui_passport="2450123450101"),
            headers=other,
        ).status_code
        == 201
    )


# ---------------------------------------------------------------------------
# Conflictos que salían como 500
# ---------------------------------------------------------------------------
def test_moving_an_email_onto_an_existing_one_is_a_conflict(client, world):
    """`create_user` lo comprobaba; `update_user` no, y rompía contra el índice."""
    headers = auth(client, "admin@test.com")
    res = client.patch(
        f"/users/{world['student'].id}",
        json={"email": "teacher_a@test.com"},
        headers=headers,
    )
    assert res.status_code == 409, res.text


# ---------------------------------------------------------------------------
# Una cuenta de baja no rota sesiones
# ---------------------------------------------------------------------------
def test_a_deactivated_account_cannot_refresh_its_session(client, db, world):
    login = client.post(
        "/auth/login", data={"username": "student@test.com", "password": "secret123"}
    )
    assert login.status_code == 200
    refresh_token = login.json()["refresh_token"]

    world["student"].is_active = False
    db.flush()

    res = client.post("/auth/refresh", json={"refresh_token": refresh_token})
    assert res.status_code == 401, res.text


# ---------------------------------------------------------------------------
# Las academias también dejan traza
# ---------------------------------------------------------------------------
def test_creating_and_editing_an_academy_is_audited(client, db):
    superadmin = User(
        email="super_audit@test.com",
        full_name="Super",
        role=UserRole.superadmin,
        password_hash=hash_password("secret123"),
        tenant_id=None,
    )
    db.add(superadmin)
    db.flush()
    headers = auth(client, "super_audit@test.com")

    created = client.post(
        "/tenants",
        json={"name": "Auditada", "slug": "auditada", "max_active_students": 10},
        headers=headers,
    )
    assert created.status_code == 201
    tenant_id = created.json()["id"]

    # Subir el cupo contratado es un cambio comercial: tiene que poder explicarse.
    updated = client.patch(
        f"/tenants/{tenant_id}", json={"max_active_students": 999}, headers=headers
    )
    assert updated.status_code == 200

    trail = client.get(
        "/audit", params={"entity": "tenant", "entity_id": tenant_id}, headers=headers
    )
    assert trail.status_code == 200
    actions = [row["action"] for row in trail.json()["items"]]
    assert "create" in actions
    assert "update" in actions


# ---------------------------------------------------------------------------
# Una matrícula con expediente no se borra
# ---------------------------------------------------------------------------
def test_an_enrollment_with_a_record_refuses_to_be_deleted(client, db, world):
    """El `cascade` se llevaba notas y asistencia, y la auditoría sólo guardaba
    la matrícula: el expediente desaparecía sin quedar rastro de qué había."""
    session = ClassSession(
        schedule_id=world["schedule_a"].id, date=TODAY
    )
    db.add(session)
    db.flush()
    db.add(
        Attendance(
            enrollment_id=world["enrollment"].id,
            session_id=session.id,
            status=AttendanceStatus.present,
        )
    )
    db.flush()

    headers = auth(client, "admin@test.com")
    res = client.delete(f"/enrollments/{world['enrollment'].id}", headers=headers)
    assert res.status_code == 409, res.text
    detail = res.json()["detail"]
    assert detail["reason"] == "has_academic_record"
    assert detail["attendance"] == 1
    # Y sigue ahí.
    assert db.get(Enrollment, world["enrollment"].id) is not None


def test_a_blank_enrollment_can_still_be_deleted(client, world):
    """El DELETE sigue sirviendo para lo que es: deshacer un error de captura."""
    headers = auth(client, "admin@test.com")
    res = client.delete(f"/enrollments/{world['enrollment'].id}", headers=headers)
    assert res.status_code == 204, res.text


# ---------------------------------------------------------------------------
# Una factura por el dinero que todavía no se facturó
# ---------------------------------------------------------------------------
def test_an_invoice_covers_only_what_is_not_yet_invoiced(client, world):
    headers = auth(client, "admin@test.com")
    enrollment_id = world["enrollment"].id

    client.post(
        "/payments",
        json={"enrollment_id": enrollment_id, "kind": "payment", "amount": 100.0},
        headers=headers,
    )
    first = client.post(f"/enrollments/{enrollment_id}/invoice", headers=headers)
    assert first.status_code == 201
    assert first.json()["total_amount"] == 100.0

    # Sin pagos nuevos no hay nada que facturar: emitirla otra vez duplicaba el
    # comprobante y la academia aparecía cobrando el doble.
    second = client.post(f"/enrollments/{enrollment_id}/invoice", headers=headers)
    assert second.status_code == 409, second.text

    # Con un pago nuevo, la siguiente factura cubre sólo ese pago.
    client.post(
        "/payments",
        json={"enrollment_id": enrollment_id, "kind": "payment", "amount": 40.0},
        headers=headers,
    )
    third = client.post(f"/enrollments/{enrollment_id}/invoice", headers=headers)
    assert third.status_code == 201
    assert third.json()["total_amount"] == 40.0
