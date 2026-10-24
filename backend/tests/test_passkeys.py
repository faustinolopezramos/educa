"""Passkeys de extremo a extremo, con un autenticador simulado.

El módulo de WebAuthn no llegaba a cargar con la versión instalada de la
librería, así que ninguna de estas rutas había funcionado nunca. El autenticador
simulado fabrica respuestas válidas con una clave P-256 real, por lo que lo que se
prueba es la verificación de verdad, no un doble.
"""

import base64
import hashlib
import json
import struct

import cbor2
import pytest
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec

from app.core.config import settings
from app.models import UserRole, WebAuthnCredential
from tests.conftest import auth, make_user


def b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip("=")


class FakeAuthenticator:
    """Una passkey de plataforma: guarda su clave y firma como lo haría el SO."""

    def __init__(self):
        self.key = ec.generate_private_key(ec.SECP256R1())
        self.cred_id = hashlib.sha256(b"cred" + bytes(self.key.private_numbers().private_value.to_bytes(32, "big"))).digest()
        self.counter = 0

    def _rp_hash(self) -> bytes:
        return hashlib.sha256(settings.webauthn_rp_id.encode()).digest()

    def _client_data(self, kind: str, challenge: str) -> bytes:
        return json.dumps(
            {"type": kind, "challenge": challenge, "origin": settings.webauthn_origin}
        ).encode()

    def register(self, challenge: str, *, user_verified: bool = True) -> dict:
        nums = self.key.public_key().public_numbers()
        cose = cbor2.dumps({1: 2, 3: -7, -1: 1, -2: nums.x.to_bytes(32, "big"), -3: nums.y.to_bytes(32, "big")})
        flags = 0x41 | (0x04 if user_verified else 0)  # UP | AT | UV
        auth_data = (
            self._rp_hash() + bytes([flags]) + struct.pack(">I", 0)
            + b"\x00" * 16 + struct.pack(">H", len(self.cred_id)) + self.cred_id + cose
        )
        return {
            "id": b64(self.cred_id),
            "rawId": b64(self.cred_id),
            "type": "public-key",
            "response": {
                "attestationObject": b64(cbor2.dumps({"fmt": "none", "attStmt": {}, "authData": auth_data})),
                "clientDataJSON": b64(self._client_data("webauthn.create", challenge)),
                "transports": ["internal"],
            },
        }

    def assert_(self, challenge: str, *, user_verified: bool = True) -> dict:
        self.counter += 1
        flags = 0x01 | (0x04 if user_verified else 0)
        auth_data = self._rp_hash() + bytes([flags]) + struct.pack(">I", self.counter)
        client_data = self._client_data("webauthn.get", challenge)
        signature = self.key.sign(auth_data + hashlib.sha256(client_data).digest(), ec.ECDSA(hashes.SHA256()))
        return {
            "id": b64(self.cred_id),
            "rawId": b64(self.cred_id),
            "type": "public-key",
            "response": {
                "authenticatorData": b64(auth_data),
                "clientDataJSON": b64(client_data),
                "signature": b64(signature),
            },
        }


def _register(client, headers, authenticator, **kw) -> str:
    start = client.post("/auth/webauthn/register/start", json={"password": "secret123"}, headers=headers)
    assert start.status_code == 200, start.text
    options = json.loads(start.json()["options"])
    res = client.post(
        "/auth/webauthn/register/finish",
        json={"credential": authenticator.register(options["challenge"], **kw), "challenge": options["challenge"]},
        headers=headers,
    )
    return res


@pytest.fixture
def passkey_user(client, db):
    user = make_user(db, "pk@test.com", UserRole.teacher)
    return user, auth(client, "pk@test.com")


def test_registration_options_carry_the_challenge_that_was_stored(client, passkey_user, db):
    from app.models import WebAuthnChallenge
    from sqlalchemy import select

    _, headers = passkey_user
    options = json.loads(client.post("/auth/webauthn/register/start", json={"password": "secret123"}, headers=headers).json()["options"])
    stored = db.scalars(select(WebAuthnChallenge.challenge)).all()
    assert options["challenge"] in stored
    assert options["authenticatorSelection"]["userVerification"] == "required"


def test_a_passkey_can_be_registered_and_is_persisted(client, passkey_user, db):
    user, headers = passkey_user
    res = _register(client, headers, FakeAuthenticator())
    assert res.status_code == 200, res.text
    listing = client.get("/auth/webauthn/credentials", headers=headers).json()["credentials"]
    assert len(listing) == 1
    assert db.query(WebAuthnCredential).filter_by(user_id=user.id).count() == 1


def test_a_registration_without_user_verification_is_refused(client, passkey_user):
    _, headers = passkey_user
    res = _register(client, headers, FakeAuthenticator(), user_verified=False)
    assert res.status_code == 400


def test_a_challenge_works_once(client, passkey_user):
    _, headers = passkey_user
    authenticator = FakeAuthenticator()
    options = json.loads(client.post("/auth/webauthn/register/start", json={"password": "secret123"}, headers=headers).json()["options"])
    body = {"credential": authenticator.register(options["challenge"]), "challenge": options["challenge"]}
    assert client.post("/auth/webauthn/register/finish", json=body, headers=headers).status_code == 200
    assert client.post("/auth/webauthn/register/finish", json=body, headers=headers).status_code == 400


def test_a_challenge_issued_to_someone_else_is_refused(client, db, passkey_user):
    _, headers = passkey_user
    make_user(db, "other@test.com", UserRole.teacher)
    other = auth(client, "other@test.com")
    options = json.loads(client.post("/auth/webauthn/register/start", json={"password": "secret123"}, headers=headers).json()["options"])
    res = client.post(
        "/auth/webauthn/register/finish",
        json={"credential": FakeAuthenticator().register(options["challenge"]), "challenge": options["challenge"]},
        headers=other,
    )
    assert res.status_code == 400


def _login_with_passkey(client, authenticator, **kw):
    start = client.post("/auth/webauthn/authenticate/start")
    assert start.status_code == 200, start.text
    challenge = json.loads(start.json()["options"])["challenge"]
    return client.post(
        "/auth/webauthn/authenticate/finish",
        json={"credential": authenticator.assert_(challenge, **kw), "challenge": challenge},
    )


def test_a_registered_passkey_opens_a_session_without_a_password(client, passkey_user):
    _, headers = passkey_user
    authenticator = FakeAuthenticator()
    assert _register(client, headers, authenticator).status_code == 200

    res = _login_with_passkey(client, authenticator)
    assert res.status_code == 200, res.text
    access = res.json()["token"]["access_token"]
    me = client.get("/auth/me", headers={"Authorization": f"Bearer {access}"})
    assert me.status_code == 200 and me.json()["email"] == "pk@test.com"


def test_an_assertion_without_user_verification_is_refused(client, passkey_user):
    _, headers = passkey_user
    authenticator = FakeAuthenticator()
    assert _register(client, headers, authenticator).status_code == 200
    assert _login_with_passkey(client, authenticator, user_verified=False).status_code == 401


def test_an_unknown_passkey_is_refused(client, passkey_user):
    assert _login_with_passkey(client, FakeAuthenticator()).status_code == 401


def test_a_registration_challenge_cannot_authenticate(client, passkey_user):
    _, headers = passkey_user
    authenticator = FakeAuthenticator()
    assert _register(client, headers, authenticator).status_code == 200
    reg = json.loads(client.post("/auth/webauthn/register/start", json={"password": "secret123"}, headers=headers).json()["options"])
    res = client.post(
        "/auth/webauthn/authenticate/finish",
        json={"credential": authenticator.assert_(reg["challenge"]), "challenge": reg["challenge"]},
    )
    assert res.status_code == 401


def test_a_deactivated_account_cannot_use_its_passkey(client, passkey_user, db):
    user, headers = passkey_user
    authenticator = FakeAuthenticator()
    assert _register(client, headers, authenticator).status_code == 200
    user.is_active = False
    db.flush()
    assert _login_with_passkey(client, authenticator).status_code == 401


def test_a_passkey_can_be_deleted(client, passkey_user):
    _, headers = passkey_user
    assert _register(client, headers, FakeAuthenticator()).status_code == 200
    cred_id = client.get("/auth/webauthn/credentials", headers=headers).json()["credentials"][0]["id"]
    assert client.delete(f"/auth/webauthn/credentials/{cred_id}", headers=headers).status_code == 204
    assert client.get("/auth/webauthn/credentials", headers=headers).json()["credentials"] == []
