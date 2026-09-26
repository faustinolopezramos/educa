"""Suspender una academia corta el acceso de toda su gente.

La pantalla de academias prometía "sin acceso hasta reactivar", pero nada lo
imponía: con la academia suspendida, su admin iniciaba sesión y usaba la API
igual que antes. El único efecto era que el barrido semanal de riesgo la
saltaba.
"""

from app.core.security import hash_password
from app.models import Tenant, User, UserRole
from tests.conftest import auth


def _academy(db, slug: str, *, active: bool = True) -> Tenant:
    tenant = Tenant(name=slug, slug=slug, max_active_students=10, is_active=active)
    db.add(tenant)
    db.flush()
    db.add(
        User(
            email=f"admin@{slug}.com",
            full_name=f"Admin {slug}",
            role=UserRole.admin,
            password_hash=hash_password("secret123"),
            tenant_id=tenant.id,
        )
    )
    db.flush()
    return tenant


def _login(client, email):
    return client.post("/auth/login", data={"username": email, "password": "secret123"})


def test_a_suspended_academy_cannot_log_in_and_is_told_why(client, db):
    _academy(db, "susp", active=False)
    res = _login(client, "admin@susp.com")
    assert res.status_code == 403
    assert "suspendida" in res.json()["detail"]


def test_wrong_password_on_a_suspended_academy_reveals_nothing(client, db):
    """El aviso de suspensión sólo lo ve quien acreditó ser de la academia."""
    _academy(db, "susp", active=False)
    res = client.post(
        "/auth/login", data={"username": "admin@susp.com", "password": "wrong-pass"}
    )
    assert res.status_code == 401


def test_suspending_ends_the_sessions_already_open(client, db):
    tenant = _academy(db, "alfa")
    login = _login(client, "admin@alfa.com").json()
    headers = {"Authorization": f"Bearer {login['access_token']}"}
    assert client.get("/users", headers=headers).status_code == 200

    tenant.is_active = False
    db.flush()

    assert client.get("/users", headers=headers).status_code == 401
    refreshed = client.post("/auth/refresh", json={"refresh_token": login["refresh_token"]})
    assert refreshed.status_code == 401


def test_reactivating_restores_access(client, db):
    tenant = _academy(db, "alfa", active=False)
    assert _login(client, "admin@alfa.com").status_code == 403
    tenant.is_active = True
    db.flush()
    assert _login(client, "admin@alfa.com").status_code == 200


def test_other_academies_and_the_superadmin_are_unaffected(client, db):
    _academy(db, "susp", active=False)
    _academy(db, "beta")
    db.add(
        User(
            email="root@educa.com",
            full_name="Root",
            role=UserRole.superadmin,
            password_hash=hash_password("secret123"),
            tenant_id=None,
        )
    )
    db.flush()
    assert _login(client, "admin@beta.com").status_code == 200
    root = auth(client, "root@educa.com")
    # Y el superadmin puede seguir viendo la academia suspendida para reactivarla.
    slugs = [t["slug"] for t in client.get("/tenants", headers=root).json()]
    assert "susp" in slugs
