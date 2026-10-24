"""Endurecimiento de la fase 1: caché, recuperación de contraseña y topes."""

import pyotp

from app.core.config import settings
from app.core.security import create_password_reset_token
from app.models import UserRole
from tests.conftest import auth, clear_route_limits, make_user


def test_per_user_catalog_answers_vary_by_credential(client, db):
    make_user(db, "a@test.com", UserRole.admin)
    res = client.get("/catalog/languages", headers=auth(client, "a@test.com"))
    assert res.headers["Cache-Control"].startswith("private")
    assert "Authorization" in res.headers["Vary"]


def test_health_stays_cacheable_without_vary(client):
    res = client.get("/health")
    assert res.headers["Cache-Control"] == "max-age=30"
    assert "Authorization" not in res.headers.get("Vary", "")


def test_the_reset_link_points_at_the_web_not_at_the_request_host(client, db, monkeypatch):
    sent = []
    from app.services import email as email_service

    monkeypatch.setattr(email_service, "email_configured", lambda: True)
    monkeypatch.setattr(email_service, "deliver_email", lambda **kw: sent.append(kw))
    monkeypatch.setattr(settings, "app_url", "https://app.educa.example")
    make_user(db, "victim@test.com", UserRole.student)

    res = client.post(
        "/auth/forgot-password",
        json={"email": "victim@test.com"},
        headers={"Host": "evil.example"},
    )
    assert res.status_code == 200
    assert len(sent) == 1
    body = sent[0]["body_text"]
    assert "https://app.educa.example/recuperar-clave?token=" in body
    assert "evil.example" not in body


def test_the_reset_token_is_not_written_to_the_log(client, db, monkeypatch, caplog):
    from app.services import email as email_service

    monkeypatch.setattr(email_service, "email_configured", lambda: False)
    monkeypatch.setattr(settings, "environment", "production")
    make_user(db, "nolog@test.com", UserRole.student)
    with caplog.at_level("DEBUG"):
        client.post("/auth/forgot-password", json={"email": "nolog@test.com"})
    assert "recuperar-clave" not in caplog.text
    assert "token=" not in caplog.text


def test_forgot_password_is_rate_limited_per_address(client, db):
    codes = [
        client.post("/auth/forgot-password", json={"email": f"x{i}@test.com"}).status_code
        for i in range(7)
    ]
    assert codes[:5] == [200] * 5
    assert codes[5:] == [429, 429]


def test_a_rate_limited_response_still_carries_the_security_headers(client, db):
    """El 429 sale del middleware sin pasar por los endpoints; antes salía
    también sin X-Frame-Options ni nosniff."""
    for i in range(5):
        client.post("/auth/forgot-password", json={"email": f"h{i}@test.com"})
    res = client.post("/auth/forgot-password", json={"email": "h5@test.com"})
    assert res.status_code == 429
    assert res.headers["X-Frame-Options"] == "DENY"
    assert res.headers["X-Content-Type-Options"] == "nosniff"


def test_a_reset_does_not_replace_the_second_factor(client, db):
    user = make_user(db, "mfa-reset@test.com", UserRole.admin)
    user.mfa_enabled = True
    user.mfa_secret = pyotp.random_base32()
    db.flush()
    token = create_password_reset_token(str(user.id), user.token_version)

    res = client.post(
        "/auth/reset-password", json={"token": token, "new_password": "Brand-new-pass-77!"}
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert "access_token" not in body and body["temp_token"]


def test_mfa_verify_has_its_own_per_minute_budget(client, db):
    user = make_user(db, "budget@test.com", UserRole.admin)
    user.mfa_enabled = True
    user.mfa_secret = pyotp.random_base32()
    db.flush()
    temp = client.post(
        "/auth/login", data={"username": "budget@test.com", "password": "secret123"}
    ).json()["temp_token"]
    clear_route_limits()
    statuses = [
        client.post(
            "/auth/mfa/verify",
            json={"token": "000000"},
            headers={"Authorization": f"Bearer {temp}"},
        ).status_code
        for _ in range(6)
    ]
    assert statuses[:5] == [401] * 5
    assert statuses[5] == 429
