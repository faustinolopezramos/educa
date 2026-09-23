"""El canje de un token de Supabase por una sesión de Educa.

El endpoint leía el token sin comprobar la firma, así que un JWT fabricado a
mano con el correo de un administrador bastaba para recibir una sesión suya.
Ahora el token se valida contra Supabase y sólo abre la puerta a una cuenta que
ya existe aquí. Estas pruebas fijan las dos mitades: qué se rechaza y qué se
concede.

`fetch_supabase_user` es el único punto que sale a la red, así que es lo que se
sustituye; todo lo demás corre de verdad.
"""

import pytest

from app.models import Tenant, User, UserRole
from app.services import supabase_auth
from app.services.supabase_auth import SupabaseUser
from tests.conftest import make_user

ENDPOINT = "/auth/supabase-login"


@pytest.fixture(autouse=True)
def supabase_configured(monkeypatch):
    """Sin credenciales configuradas el endpoint responde 503 y no llega a mirar
    el token, así que las pruebas parten de un servidor que sí las tiene."""
    monkeypatch.setattr(supabase_auth, "is_configured", lambda: True)


def _supabase_says(monkeypatch, user: SupabaseUser | None):
    monkeypatch.setattr(supabase_auth, "fetch_supabase_user", lambda token: user)


def _account(email: str, uid: str = "uid-123", confirmed: bool = True) -> SupabaseUser:
    return SupabaseUser(
        uid=uid, email=email, email_confirmed=confirmed, full_name="Alguien"
    )


def test_a_token_supabase_does_not_recognize_is_refused(client, db, monkeypatch):
    make_user(db, "profe@test.com", UserRole.teacher)
    db.commit()
    _supabase_says(monkeypatch, None)

    res = client.post(ENDPOINT, json={"supabase_token": "falsificado"})

    assert res.status_code == 401


def test_an_unconfirmed_email_cannot_claim_an_account(client, db, monkeypatch):
    """Enlazar por correo sólo vale si Supabase confirmó que la persona lo
    controla. Si no, registrarse con el correo de otro sería suficiente para
    quedarse con su cuenta."""
    make_user(db, "admin@test.com", UserRole.admin)
    db.commit()
    _supabase_says(monkeypatch, _account("admin@test.com", confirmed=False))

    res = client.post(ENDPOINT, json={"supabase_token": "tok"})

    assert res.status_code == 401


def test_an_unknown_email_does_not_become_a_new_account(client, db, monkeypatch):
    """El endpoint da acceso, no da de alta: antes, cualquier correo nuevo se
    convertía en un alumno recién creado."""
    _supabase_says(monkeypatch, _account("desconocido@test.com"))

    res = client.post(ENDPOINT, json={"supabase_token": "tok"})

    assert res.status_code == 401
    assert db.query(User).filter(User.email == "desconocido@test.com").count() == 0


def test_a_deactivated_account_stays_out(client, db, monkeypatch):
    user = make_user(db, "baja@test.com", UserRole.teacher)
    user.is_active = False
    db.commit()
    _supabase_says(monkeypatch, _account("baja@test.com"))

    res = client.post(ENDPOINT, json={"supabase_token": "tok"})

    assert res.status_code == 401


def test_the_endpoint_is_off_when_supabase_is_not_configured(
    client, db, monkeypatch
):
    monkeypatch.setattr(supabase_auth, "is_configured", lambda: False)

    res = client.post(ENDPOINT, json={"supabase_token": "tok"})

    assert res.status_code == 503


def test_a_known_account_gets_a_session_and_keeps_the_link(client, db, monkeypatch):
    user = make_user(db, "profe@test.com", UserRole.teacher)
    db.commit()
    _supabase_says(monkeypatch, _account("profe@test.com", uid="uid-abc"))

    res = client.post(ENDPOINT, json={"supabase_token": "tok"})

    assert res.status_code == 200, res.text
    assert res.json()["user"]["email"] == "profe@test.com"
    db.refresh(user)
    # El vínculo queda guardado, así que la próxima vez se resuelve por uid.
    assert user.supabase_uid == "uid-abc"


def test_the_refresh_session_survives_the_request(client, db, monkeypatch):
    """Faltaba el commit: el usuario recibía un refresh token cuyo `jti` no
    estaba en la base, y renovar la sesión lo echaba fuera."""
    make_user(db, "profe@test.com", UserRole.teacher)
    db.commit()
    _supabase_says(monkeypatch, _account("profe@test.com"))

    tokens = client.post(ENDPOINT, json={"supabase_token": "tok"}).json()
    renewed = client.post(
        "/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
    )

    assert renewed.status_code == 200, renewed.text


def test_an_account_linked_to_someone_else_is_refused(client, db, monkeypatch):
    user = make_user(db, "profe@test.com", UserRole.teacher)
    user.supabase_uid = "uid-del-titular"
    db.commit()
    _supabase_says(monkeypatch, _account("profe@test.com", uid="uid-de-otro"))

    res = client.post(ENDPOINT, json={"supabase_token": "tok"})

    assert res.status_code == 401
    db.refresh(user)
    assert user.supabase_uid == "uid-del-titular"


def test_the_same_email_in_two_academies_asks_which_one(client, db, monkeypatch):
    norte = Tenant(name="Academia Norte", slug="norte", max_active_students=50)
    sur = Tenant(name="Academia Sur", slug="sur", max_active_students=50)
    db.add_all([norte, sur])
    db.flush()
    for tenant in (norte, sur):
        u = make_user(db, f"dos@test.com-{tenant.slug}", UserRole.teacher)
        u.email = "dos@test.com"
        u.tenant_id = tenant.id
    db.commit()
    _supabase_says(monkeypatch, _account("dos@test.com"))

    res = client.post(ENDPOINT, json={"supabase_token": "tok"})

    assert res.status_code == 409
    assert res.json()["detail"]["code"] == "tenant_required"

    # Con la academia elegida, entra en esa y no en la otra.
    chosen = client.post(
        ENDPOINT,
        json={"supabase_token": "tok"},
        headers={"X-Tenant-Slug": "sur"},
    )
    assert chosen.status_code == 200, chosen.text
    assert chosen.json()["user"]["tenant_id"] == sur.id
