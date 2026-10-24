"""Segundo factor: del alta al login, incluidos los caminos que lo burlarían."""

from datetime import datetime, timedelta, timezone

import jwt
import pyotp
import pytest

from app.core import security
from app.models import UserRole
from tests.conftest import auth, clear_route_limits, make_user

PASSWORD = "secret123"


def _enable_mfa(client, db, email="mfa@test.com", role=UserRole.admin):
    """Un usuario con MFA activado por la API, como lo haría una persona real."""
    user = make_user(db, email, role)
    headers = auth(client, email)
    setup = client.post("/auth/mfa/setup", json={"password": PASSWORD}, headers=headers).json()
    code = pyotp.TOTP(setup["secret"]).now()
    res = client.post("/auth/mfa/enable", json={"token": code}, headers=headers)
    assert res.status_code == 200, res.text
    db.refresh(user)
    return user, setup


def _challenge(client, email="mfa@test.com") -> str:
    res = client.post("/auth/login", data={"username": email, "password": PASSWORD})
    assert res.status_code == 200, res.text
    body = res.json()
    assert "access_token" not in body, "con MFA activo el login no debe dar sesión"
    return body["temp_token"]


def _verify(client, temp: str, code: str):
    return client.post(
        "/auth/mfa/verify",
        json={"token": code},
        headers={"Authorization": f"Bearer {temp}"},
    )


def _next_code(secret: str) -> str:
    """Un código válido y distinto del último que se aceptó (la ventana siguiente)."""
    totp = pyotp.TOTP(secret)
    return totp.at(datetime.now(timezone.utc) + timedelta(seconds=30))


def test_login_with_mfa_returns_a_challenge_not_a_session(client, db):
    _enable_mfa(client, db)
    assert _challenge(client)


def test_the_challenge_token_is_not_a_session(client, db):
    """Regresión: era un access token con una marca que nadie comprobaba."""
    _enable_mfa(client, db)
    temp = _challenge(client)
    headers = {"Authorization": f"Bearer {temp}"}
    for path in ("/auth/me", "/users", "/audit"):
        assert client.get(path, headers=headers).status_code == 401, path


def test_a_valid_code_completes_the_login(client, db):
    _, setup = _enable_mfa(client, db)
    temp = _challenge(client)
    res = _verify(client, temp, _next_code(setup["secret"]))
    assert res.status_code == 200, res.text
    me = client.get(
        "/auth/me", headers={"Authorization": f"Bearer {res.json()['access_token']}"}
    )
    assert me.status_code == 200


def test_a_wrong_code_is_refused(client, db):
    _enable_mfa(client, db)
    res = _verify(client, _challenge(client), "000000")
    assert res.status_code == 401


def test_an_accepted_code_cannot_be_replayed(client, db):
    _, setup = _enable_mfa(client, db)
    code = _next_code(setup["secret"])
    assert _verify(client, _challenge(client), code).status_code == 200
    assert _verify(client, _challenge(client), code).status_code == 401


def test_the_backup_codes_shown_at_setup_are_the_ones_that_work(client, db):
    _, setup = _enable_mfa(client, db)
    res = _verify(client, _challenge(client), setup["backup_codes"][0])
    assert res.status_code == 200, res.text


def test_a_backup_code_works_only_once(client, db):
    _, setup = _enable_mfa(client, db)
    code = setup["backup_codes"][0]
    assert _verify(client, _challenge(client), code).status_code == 200
    assert _verify(client, _challenge(client), code).status_code == 401
    # Los demás siguen valiendo.
    assert _verify(client, _challenge(client), setup["backup_codes"][1]).status_code == 200


def test_a_refresh_or_access_token_is_not_a_challenge(client, db):
    """`/mfa/verify` sólo canjea el token del desafío."""
    _, setup = _enable_mfa(client, db)
    access = client.post(
        "/auth/login", data={"username": "mfa@test.com", "password": PASSWORD}
    ).json()["temp_token"]
    # Un access token auténtico de otra cuenta sin MFA tampoco vale.
    make_user(db, "plain@test.com", UserRole.admin)
    plain = auth(client, "plain@test.com")["Authorization"].split(" ", 1)[1]
    res = _verify(client, plain, _next_code(setup["secret"]))
    assert res.status_code == 401
    assert access  # el desafío auténtico sí existe


def test_a_challenge_dies_when_the_password_changes(client, db):
    user, setup = _enable_mfa(client, db)
    temp = _challenge(client)
    user.token_version += 1
    db.flush()
    assert _verify(client, temp, _next_code(setup["secret"])).status_code == 401


def test_repeated_wrong_codes_lock_the_account(client, db):
    _, setup = _enable_mfa(client, db)
    temp = _challenge(client)
    for _ in range(5):
        _verify(client, temp, "000000")
        clear_route_limits()  # el tope por IP del middleware no es lo que se prueba
    res = _verify(client, temp, _next_code(setup["secret"]))
    assert res.status_code == 429
    assert res.json()["detail"]["code"] == "mfa_locked"


def test_disabling_mfa_needs_the_current_code(client, db):
    user, setup = _enable_mfa(client, db)
    headers = auth_after_mfa(client, setup)
    # Sólo con la contraseña: el esquema lo rechaza.
    assert (
        client.post("/auth/mfa/disable", json={"password": PASSWORD}, headers=headers).status_code
        == 422
    )
    wrong = client.post(
        "/auth/mfa/disable", json={"password": PASSWORD, "token": "000000"}, headers=headers
    )
    assert wrong.status_code == 400
    ok = client.post(
        "/auth/mfa/disable",
        json={"password": PASSWORD, "token": setup["backup_codes"][5]},
        headers=headers,
    )
    assert ok.status_code == 200, ok.text
    db.refresh(user)
    assert not user.mfa_enabled


def auth_after_mfa(client, setup) -> dict[str, str]:
    res = _verify(client, _challenge(client), setup["backup_codes"][0])
    assert res.status_code == 200, res.text
    return {"Authorization": f"Bearer {res.json()['access_token']}"}


def test_setup_codes_are_stored_hashed(client, db):
    user, setup = _enable_mfa(client, db)
    assert len(user.mfa_backup_codes) == len(setup["backup_codes"])
    assert not set(user.mfa_backup_codes) & set(setup["backup_codes"])


# ---- tokens ----


def test_an_access_token_without_a_version_is_refused(client, db):
    user = make_user(db, "nover@test.com", UserRole.admin)
    token = security.create_access_token(str(user.id), extra={"role": "admin"})
    res = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 401


def test_a_token_without_expiry_is_refused():
    forever = jwt.encode(
        {"sub": "1", "type": "access", "ver": 0},
        security._SECRET,
        algorithm=security._ALGORITHM,
    )
    assert security.decode_token(forever) is None


@pytest.mark.parametrize("claim", [{"mfa_pending": True}])
def test_a_legacy_pending_claim_is_never_a_session(client, db, claim):
    user = make_user(db, "legacy@test.com", UserRole.admin)
    token = security.create_access_token(
        str(user.id), extra={"ver": user.token_version, **claim}
    )
    res = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 401
