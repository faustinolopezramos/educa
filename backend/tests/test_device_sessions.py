"""Sesiones de dispositivo: que cerrarlas cierre de verdad."""

import pyotp

from app.models import DeviceSession, UserRole
from tests.conftest import clear_route_limits, make_user


def _login(client, email="dev@test.com", ua="Mozilla/5.0 (Macintosh) Chrome/120"):
    res = client.post(
        "/auth/login",
        data={"username": email, "password": "secret123"},
        headers={"User-Agent": ua},
    )
    assert res.status_code == 200, res.text
    clear_route_limits()
    return res.json()


def _bearer(tokens):
    return {"Authorization": f"Bearer {tokens['access_token']}"}


def _refresh(client, tokens):
    return client.post("/auth/refresh", json={"refresh_token": tokens["refresh_token"]})


def test_a_login_registers_its_device(client, db):
    user = make_user(db, "dev@test.com", UserRole.teacher)
    _login(client)
    assert db.query(DeviceSession).filter_by(user_id=user.id).count() == 1


def test_the_listing_marks_the_session_asking(client, db):
    make_user(db, "dev@test.com", UserRole.teacher)
    first = _login(client, ua="Mozilla/5.0 Firefox/120")
    second = _login(client, ua="Mozilla/5.0 Chrome/120")
    rows = client.get("/auth/device-sessions", headers=_bearer(second)).json()["sessions"]
    assert len(rows) == 2
    assert sum(r["is_current"] for r in rows) == 1
    assert first  # la otra sesión sigue existiendo


def test_revoking_a_device_closes_its_refresh_token(client, db):
    make_user(db, "dev@test.com", UserRole.teacher)
    stolen = _login(client, ua="Mozilla/5.0 Firefox/120")
    mine = _login(client, ua="Mozilla/5.0 Chrome/120")
    rows = client.get("/auth/device-sessions", headers=_bearer(mine)).json()["sessions"]
    other = next(r for r in rows if not r["is_current"])

    res = client.post("/auth/device-sessions/revoke", json={"session_id": other["id"]}, headers=_bearer(mine))
    assert res.status_code == 204

    assert _refresh(client, stolen).status_code == 401  # el dispositivo revocado ya no renueva
    assert _refresh(client, mine).status_code == 200  # el mío sigue


def test_revoke_all_other_keeps_the_current_session(client, db):
    make_user(db, "dev@test.com", UserRole.teacher)
    other = _login(client, ua="Mozilla/5.0 Firefox/120")
    mine = _login(client, ua="Mozilla/5.0 Chrome/120")

    res = client.post("/auth/device-sessions/revoke-all-other", headers=_bearer(mine))
    assert res.status_code == 200, res.text
    assert res.json()["revoked_count"] == 1

    assert _refresh(client, other).status_code == 401
    assert _refresh(client, mine).status_code == 200


def test_revoke_all_closes_every_refresh_token(client, db):
    make_user(db, "dev@test.com", UserRole.teacher)
    a = _login(client, ua="Mozilla/5.0 Firefox/120")
    b = _login(client, ua="Mozilla/5.0 Chrome/120")
    assert client.post("/auth/device-sessions/revoke-all", headers=_bearer(b)).status_code == 204
    assert _refresh(client, a).status_code == 401
    assert _refresh(client, b).status_code == 401


def test_a_refresh_keeps_the_device_session_closable(client, db):
    """Tras renovar, la sesión de dispositivo sigue al nuevo refresh token."""
    user = make_user(db, "dev@test.com", UserRole.teacher)
    tokens = _login(client)
    renewed = _refresh(client, tokens).json()

    sessions = db.query(DeviceSession).filter_by(user_id=user.id).all()
    assert len(sessions) == 1
    rows = client.get("/auth/device-sessions", headers=_bearer(renewed)).json()["sessions"]
    assert rows[0]["is_current"] is True

    client.post("/auth/device-sessions/revoke", json={"session_id": rows[0]["id"]}, headers=_bearer(renewed))
    assert _refresh(client, renewed).status_code == 401


def test_the_password_step_of_an_mfa_login_registers_no_device(client, db):
    user = make_user(db, "dev@test.com", UserRole.teacher)
    user.mfa_enabled = True
    user.mfa_secret = pyotp.random_base32()
    db.flush()
    res = client.post("/auth/login", data={"username": "dev@test.com", "password": "secret123"})
    assert "temp_token" in res.json()
    assert db.query(DeviceSession).filter_by(user_id=user.id).count() == 0


def test_the_second_factor_registers_the_device(client, db):
    user = make_user(db, "dev@test.com", UserRole.teacher)
    user.mfa_enabled = True
    user.mfa_secret = secret = pyotp.random_base32()
    db.flush()
    temp = client.post("/auth/login", data={"username": "dev@test.com", "password": "secret123"}).json()["temp_token"]
    res = client.post(
        "/auth/mfa/verify",
        json={"token": pyotp.TOTP(secret).now()},
        headers={"Authorization": f"Bearer {temp}"},
    )
    assert res.status_code == 200, res.text
    assert db.query(DeviceSession).filter_by(user_id=user.id).count() == 1
