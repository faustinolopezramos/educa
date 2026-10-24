"""Re-escaneo de seguridad (2026-10-22): lo que cada hallazgo dejó sin cubrir."""

import importlib.util
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pyotp
import pytest
from cryptography.fernet import Fernet
from sqlalchemy import select, text

from app.core.config import settings
from app.core.rate_limiter import MemoryRateLimiter, RedisRateLimiter
from app.models import AuditLog, User, UserRole
from app.services import account_lockout as lockout
from app.services import mfa
from app.services.audit import snapshot
from tests.conftest import auth, clear_route_limits, make_user

PASSWORD = "secret123"


def _next_code(secret: str) -> str:
    """Un código válido y distinto del que activó el MFA (la ventana siguiente)."""
    return pyotp.TOTP(secret).at(datetime.now(timezone.utc) + timedelta(seconds=30))


def _enable_mfa(client, db, email="rescan@test.com", role=UserRole.admin):
    user = make_user(db, email, role)
    headers = auth(client, email)
    setup = client.post(
        "/auth/mfa/setup", json={"password": PASSWORD}, headers=headers
    ).json()
    res = client.post(
        "/auth/mfa/enable",
        json={"token": pyotp.TOTP(setup["secret"]).now()},
        headers=headers,
    )
    assert res.status_code == 200, res.text
    db.refresh(user)
    return user, setup, headers


# ---------------- 1. El secreto TOTP no entra en la auditoría ----------------
def test_snapshot_redacts_the_mfa_secret_and_backup_codes():
    user = User(
        email="a@b.c",
        full_name="X",
        role=UserRole.admin,
        password_hash="h",
        mfa_secret="JBSWY3DPEHPK3PXP",
        mfa_backup_codes=["$2b$12$hash"],
    )
    snap = snapshot(user)
    assert snap["mfa_secret"] == "***"
    assert snap["mfa_backup_codes"] == "***"


def test_the_audit_endpoint_never_shows_a_totp_seed(client, db):
    user, setup, headers = _enable_mfa(client, db)
    # Editar el perfil (y la baja, y el alta) escribe un snapshot de la cuenta.
    res = client.patch("/auth/me", json={"full_name": "Nuevo Nombre"}, headers=headers)
    assert res.status_code == 200, res.text
    audit = client.get("/audit", headers=headers)
    assert audit.status_code == 200
    body = audit.text
    assert setup["secret"] not in body
    assert mfa.open_secret(user.mfa_secret) not in body


def test_the_migration_scrubs_secrets_already_in_the_trail(db):
    path = (
        Path(__file__).resolve().parent.parent
        / "alembic/versions/e40209ef8d8d_scrub_mfa_secrets_from_audit.py"
    )
    spec = importlib.util.spec_from_file_location("scrub_migration", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    row = AuditLog(
        action="update",
        entity="user",
        entity_id=1,
        before={"mfa_secret": "JBSWY3DPEHPK3PXP", "mfa_backup_codes": ["x"], "email": "e"},
        after={"mfa_secret": None, "full_name": "n"},
    )
    db.add(row)
    db.flush()
    for statement in module.scrub_statements():
        db.execute(text(statement))
    db.refresh(row)
    assert row.before == {"mfa_secret": "***", "mfa_backup_codes": "***", "email": "e"}
    assert row.after == {"mfa_secret": None, "full_name": "n"}


# ---------------- 2. Reautenticación al tocar la seguridad ----------------
def test_registering_a_passkey_needs_the_password(client, db):
    make_user(db, "pk@test.com", UserRole.teacher)
    headers = auth(client, "pk@test.com")
    url = "/auth/webauthn/register/start"
    assert client.post(url, headers=headers).status_code == 422
    wrong = client.post(url, json={"password": "nope-nope"}, headers=headers)
    assert wrong.status_code == 400
    ok = client.post(url, json={"password": PASSWORD}, headers=headers)
    assert ok.status_code == 200, ok.text


def test_a_failed_confirmation_is_not_a_logout(client, db):
    """400, no 401: un 401 haría que el cliente cerrara una sesión que es buena."""
    make_user(db, "pk2@test.com", UserRole.teacher)
    headers = auth(client, "pk2@test.com")
    res = client.post(
        "/auth/webauthn/register/start", json={"password": "wrong-pass"}, headers=headers
    )
    assert res.status_code == 400


def test_guessing_the_password_through_reauth_locks_the_account(client, db):
    make_user(db, "pk3@test.com", UserRole.teacher)
    headers = auth(client, "pk3@test.com")
    for _ in range(5):
        client.post(
            "/auth/webauthn/register/start", json={"password": "wrong-pass"}, headers=headers
        )
    res = client.post(
        "/auth/webauthn/register/start", json={"password": PASSWORD}, headers=headers
    )
    assert res.status_code == 429


def test_with_mfa_a_passkey_also_needs_the_code(client, db):
    user, setup, headers = _enable_mfa(client, db, "pk4@test.com")
    url = "/auth/webauthn/register/start"
    missing = client.post(url, json={"password": PASSWORD}, headers=headers)
    assert missing.status_code == 400
    assert missing.json()["detail"]["code"] == "mfa_token_required"
    bad = client.post(url, json={"password": PASSWORD, "mfa_token": "000000"}, headers=headers)
    assert bad.status_code == 400
    ok = client.post(
        url,
        json={"password": PASSWORD, "mfa_token": _next_code(setup["secret"])},
        headers=headers,
    )
    assert ok.status_code == 200, ok.text


def test_setting_up_mfa_needs_the_password(client, db):
    make_user(db, "su@test.com", UserRole.admin)
    headers = auth(client, "su@test.com")
    assert client.post("/auth/mfa/setup", headers=headers).status_code == 422
    wrong = client.post("/auth/mfa/setup", json={"password": "nope-nope"}, headers=headers)
    assert wrong.status_code == 400
    # Ya no es un GET que cambia el estado.
    assert client.get("/auth/mfa/setup", headers=headers).status_code == 405


def test_regenerating_backup_codes_needs_password_and_code(client, db):
    user, setup, headers = _enable_mfa(client, db, "rg@test.com")
    url = "/auth/mfa/regenerate-backup-codes"
    assert client.post(url, headers=headers).status_code == 422
    no_code = client.post(url, json={"password": PASSWORD}, headers=headers)
    assert no_code.status_code == 400
    ok = client.post(
        url,
        json={"password": PASSWORD, "mfa_token": _next_code(setup["secret"])},
        headers=headers,
    )
    assert ok.status_code == 200, ok.text
    assert len(ok.json()["backup_codes"]) == mfa.BACKUP_CODE_COUNT


def test_a_backup_code_used_to_confirm_is_spent(client, db):
    user, setup, headers = _enable_mfa(client, db, "bc@test.com")
    backup = setup["backup_codes"][0]
    url = "/auth/webauthn/register/start"
    first = client.post(url, json={"password": PASSWORD, "mfa_token": backup}, headers=headers)
    assert first.status_code == 200, first.text
    again = client.post(url, json={"password": PASSWORD, "mfa_token": backup}, headers=headers)
    assert again.status_code == 400


# ---------------- 3. El secreto TOTP se guarda cifrado ----------------
def test_the_totp_secret_is_stored_encrypted(client, db):
    user, setup, _ = _enable_mfa(client, db, "enc@test.com")
    assert user.mfa_secret.startswith("enc:")
    assert setup["secret"] not in user.mfa_secret
    assert mfa.open_secret(user.mfa_secret) == setup["secret"]
    # Y el segundo factor sigue funcionando de punta a punta.
    clear_route_limits()
    login = client.post("/auth/login", data={"username": "enc@test.com", "password": PASSWORD})
    temp = login.json()["temp_token"]
    res = client.post(
        "/auth/mfa/verify",
        json={"token": _next_code(setup["secret"])},
        headers={"Authorization": f"Bearer {temp}"},
    )
    assert res.status_code == 200, res.text


def test_a_plaintext_secret_still_verifies_and_gets_sealed(db):
    secret = pyotp.random_base32()
    assert mfa.open_secret(secret) == secret
    assert mfa.needs_sealing(secret)
    sealed = mfa.seal_secret(secret)
    assert sealed.startswith("enc:") and not mfa.needs_sealing(sealed)
    assert mfa.open_secret(sealed) == secret


def test_a_wrong_key_opens_nothing(monkeypatch):
    sealed = mfa.seal_secret(pyotp.random_base32())
    monkeypatch.setattr(settings, "fernet_key", Fernet.generate_key().decode())
    assert mfa.open_secret(sealed) is None
    assert not mfa.verify_mfa_token(sealed, [], "123456").success


def test_without_a_key_the_secret_is_left_as_is(monkeypatch):
    monkeypatch.setattr(settings, "fernet_key", "")
    secret = pyotp.random_base32()
    assert mfa.seal_secret(secret) == secret
    assert not mfa.needs_sealing(secret)


# ---------------- 4. Un TOTP no cuesta diez bcrypt ----------------
def test_a_six_digit_code_never_touches_the_backup_codes(monkeypatch):
    calls = []
    monkeypatch.setattr(mfa, "find_backup_code", lambda *a, **k: calls.append(a) or None)
    secret = pyotp.random_base32()
    assert not mfa.verify_mfa_token(secret, ["h1", "h2"], "000000").success
    assert calls == []
    assert not mfa.verify_mfa_token(secret, ["h1", "h2"], "ABCDEFGH").success
    assert len(calls) == 1


# ---------------- 5. El bloqueo no delata qué correos existen ----------------
def test_an_unknown_email_locks_like_a_real_one(client, db):
    make_user(db, "real@test.com", UserRole.admin)

    def hammer(email: str) -> int:
        statuses = []
        for _ in range(7):
            clear_route_limits()
            res = client.post("/auth/login", data={"username": email, "password": "wrong-pass"})
            statuses.append(res.status_code)
        return statuses

    real = hammer("real@test.com")
    fake = hammer("nobody-here@test.com")
    assert real == fake
    assert real[:5] == [401] * 5 and real[5:] == [429, 429]


def test_the_email_key_does_not_hold_the_address():
    key = lockout._email_identifier("Someone@Example.com")
    assert "someone" not in key.lower() and len(key) == 32
    assert key == lockout._email_identifier(" someone@example.com ")


# ---------------- 6. Redis caído no apaga el límite ----------------
class _DeadRedis:
    def pipeline(self):
        raise ConnectionError("redis down")

    def __getattr__(self, name):
        def boom(*a, **k):
            raise ConnectionError("redis down")

        return boom


def _dead_limiter() -> RedisRateLimiter:
    limiter = RedisRateLimiter.__new__(RedisRateLimiter)
    limiter.client = _DeadRedis()
    limiter._fallback = MemoryRateLimiter()
    return limiter


def test_a_redis_outage_falls_back_to_local_counting():
    limiter = _dead_limiter()
    for _ in range(3):
        limiter.record_failed_attempt("k", 60)
    assert limiter.count_recent("k", 60) == 3
    assert limiter.is_rate_limited("k", 3, 60)


def test_a_redis_outage_still_locks_accounts():
    svc = lockout.AccountLockoutService(_dead_limiter())
    for _ in range(5):
        status = svc.record_failed_attempt("42", lockout.USER_PREFIX)
    assert status.is_locked
    svc.clear_lockout("42", lockout.USER_PREFIX)
    assert not svc.check_lockout("42", lockout.USER_PREFIX).is_locked


# ---------------- 7. Un secreto de webhook por proveedor ----------------
def test_zoom_and_google_use_their_own_secrets(client, monkeypatch, db, world):
    import hashlib
    import hmac
    import time

    monkeypatch.setattr(settings, "webhook_secret", "common")
    monkeypatch.setattr(settings, "zoom_webhook_secret", "zoom-only")
    monkeypatch.setattr(settings, "google_webhook_token", "google-only")
    body = b'{"event":"meeting.ended","object":{"id":"none"}}'

    def zoom(secret):
        ts = str(int(time.time()))
        sig = hmac.new(secret.encode(), b"v0:" + ts.encode() + b":" + body, hashlib.sha256).hexdigest()
        return {"x-zm-request-timestamp": ts, "x-zm-signature": f"v0={sig}"}

    assert client.post("/webhooks/zoom", content=body, headers=zoom("common")).status_code == 401
    assert client.post("/webhooks/zoom", content=body, headers=zoom("zoom-only")).status_code == 200
    g = lambda token: {"x-goog-channel-token": token}
    assert client.post("/webhooks/google", content=body, headers=g("common")).status_code == 401
    assert client.post("/webhooks/google", content=body, headers=g("google-only")).status_code == 200


def test_the_common_secret_still_works_when_none_is_specific(client, monkeypatch):
    monkeypatch.setattr(settings, "webhook_secret", "common")
    monkeypatch.setattr(settings, "zoom_webhook_secret", "")
    monkeypatch.setattr(settings, "google_webhook_token", "")
    body = b'{"event":"x"}'
    res = client.post("/webhooks/google", content=body, headers={"x-goog-channel-token": "common"})
    assert res.status_code == 200
