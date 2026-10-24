import pytest
from app.core.security import hash_password, create_password_reset_token
from app.models import Tenant, User, UserRole


def test_forgot_password_anti_enumeration(client, db):
    # Non-existing email returns 200 with standard message
    res = client.post("/auth/forgot-password", json={"email": "nobody@test.com"})
    assert res.status_code == 200
    assert "instrucciones" in res.json()["message"]


def test_forgot_password_spends_no_bcrypt_on_an_unknown_email(client, db, monkeypatch):
    """Ninguna rama hace bcrypt: si sólo la del correo inexistente lo hiciera,
    la respuesta lenta diría qué correos no tienen cuenta."""
    import app.routers.auth as auth_router

    calls = []
    monkeypatch.setattr(auth_router, "verify_password", lambda *a: calls.append(a) or False)
    res = client.post("/auth/forgot-password", json={"email": "nobody@test.com"})
    assert res.status_code == 200
    assert calls == []


def test_forgot_password_for_existing_user(client, db):
    tenant = Tenant(name="Academia Reset", slug="reset-slug")
    db.add(tenant)
    db.flush()

    user = User(
        email="resetme@test.com",
        full_name="User Reset",
        role=UserRole.student,
        password_hash=hash_password("oldPass123!"),
        tenant_id=tenant.id,
    )
    db.add(user)
    db.commit()

    res = client.post("/auth/forgot-password", json={"email": "resetme@test.com"})
    assert res.status_code == 200
    assert "instrucciones" in res.json()["message"]


def test_reset_password_flow(client, db, monkeypatch):
    tenant = Tenant(name="Academia Reset 2", slug="reset-slug-2")
    db.add(tenant)
    db.flush()

    user = User(
        email="flow@test.com",
        full_name="Flow User",
        role=UserRole.teacher,
        password_hash=hash_password("oldPass123!"),
        tenant_id=tenant.id,
    )
    db.add(user)
    db.commit()

    # Generate a valid reset token
    token = create_password_reset_token(str(user.id), user.token_version, expire_minutes=15)

    # Reset with valid new password
    res = client.post("/auth/reset-password", json={"token": token, "new_password": "NewSecretPass456!"})
    assert res.status_code == 200
    data = res.json()
    assert "access_token" in data
    assert data["user"]["email"] == "flow@test.com"

    # Verify user can login with the new password
    login_res = client.post("/auth/login", data={"username": "flow@test.com", "password": "NewSecretPass456!"})
    assert login_res.status_code == 200

    # Old password no longer works
    old_res = client.post("/auth/login", data={"username": "flow@test.com", "password": "oldPass123!"})
    assert old_res.status_code == 401

    # Reusing the same reset token fails because token_version was bumped
    reuse_res = client.post("/auth/reset-password", json={"token": token, "new_password": "AnotherPass789!"})
    assert reuse_res.status_code == 400
    assert "utilizado" in reuse_res.json()["detail"]


def test_reset_password_invalid_token(client):
    res = client.post("/auth/reset-password", json={"token": "gibberish.token.here", "new_password": "ValidPass123!"})
    assert res.status_code == 400
