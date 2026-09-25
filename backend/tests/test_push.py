"""Avisos push: suscripciones por dispositivo y su canal en la cola de envíos.

Nada sale a la red. El envío real (`send_push`) se prueba de punta a punta
interceptando la petición HTTP: un "dispositivo" con sus propias claves descifra
lo que el servidor cifró con las claves VAPID que genera el CLI.
"""

import base64
import json

import http_ece
import jwt
import pytest
import requests
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from sqlalchemy import select

from app.core.config import settings
from app.models import DeliveryStatus, Notification, NotificationDelivery, PushSubscription
from app.services.delivery import dispatch_pending
from app.services.notifications import notify
from app.services.push import generate_vapid_keys, send_push
from tests.conftest import auth


def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def _unb64(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


class FakeDevice:
    """Un navegador suscrito: sus claves y un endpoint de un servicio de push."""

    def __init__(self, endpoint="https://push.example.com/send/abc"):
        self.key = ec.generate_private_key(ec.SECP256R1())
        self.auth = b"0123456789abcdef"
        self.endpoint = endpoint

    def subscription_json(self):
        pub = self.key.public_key().public_bytes(
            serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
        )
        return {"endpoint": self.endpoint, "keys": {"p256dh": _b64(pub), "auth": _b64(self.auth)}}

    def decrypt(self, body: bytes) -> dict:
        return json.loads(
            http_ece.decrypt(body, private_key=self.key, auth_secret=self.auth, version="aes128gcm")
        )


@pytest.fixture
def vapid(monkeypatch):
    public, private = generate_vapid_keys()
    monkeypatch.setattr(settings, "vapid_public_key", public)
    monkeypatch.setattr(settings, "vapid_private_key", private)
    monkeypatch.setattr(settings, "vapid_subject", "mailto:test@educa.com")
    monkeypatch.setattr(settings, "background_jobs_interval_seconds", 0)
    return public


@pytest.fixture
def captured(monkeypatch):
    """Intercepta la petición al servicio de push y responde `status`."""
    calls = []
    state = {"status": 201}

    def fake_post(url, data=None, headers=None, timeout=None, **_):
        calls.append({"url": url, "data": data, "headers": headers})
        resp = requests.Response()
        resp.status_code = state["status"]
        resp._content = b""
        return resp

    monkeypatch.setattr(requests, "post", fake_post)
    return calls, state


# ---------------- Suscribirse ----------------
def test_config_exposes_the_public_key_only_when_configured(client, world, monkeypatch):
    student = auth(client, "student@test.com")
    monkeypatch.setattr(settings, "vapid_private_key", "")
    assert client.get("/push/config", headers=student).json() == {"public_key": ""}


def test_subscribe_is_an_upsert_owned_by_whoever_is_logged_in(client, db, world, vapid):
    device = FakeDevice()
    student = auth(client, "student@test.com")
    assert client.post("/push/subscriptions", headers=student, json=device.subscription_json()).status_code == 204
    assert client.post("/push/subscriptions", headers=student, json=device.subscription_json()).status_code == 204
    [sub] = db.scalars(select(PushSubscription)).all()
    assert sub.user_id == world["student"].id

    # Teléfono compartido: entra otra persona y activa avisos en el mismo navegador.
    outsider = auth(client, "outsider@test.com")
    client.post("/push/subscriptions", headers=outsider, json=device.subscription_json())
    db.refresh(sub)
    assert sub.user_id == world["outsider"].id


def test_you_can_only_remove_your_own_device(client, db, world, vapid):
    device = FakeDevice()
    student = auth(client, "student@test.com")
    client.post("/push/subscriptions", headers=student, json=device.subscription_json())

    outsider = auth(client, "outsider@test.com")
    client.post("/push/subscriptions/remove", headers=outsider, json={"endpoint": device.endpoint})
    assert db.scalar(select(PushSubscription)) is not None

    client.post("/push/subscriptions/remove", headers=student, json={"endpoint": device.endpoint})
    assert db.scalar(select(PushSubscription)) is None


def test_subscribing_without_vapid_is_a_503(client, world):
    student = auth(client, "student@test.com")
    res = client.post("/push/subscriptions", headers=student, json=FakeDevice().subscription_json())
    assert res.status_code == 503


def test_endpoint_must_be_https(client, world, vapid):
    student = auth(client, "student@test.com")
    body = FakeDevice(endpoint="http://evil.example/x").subscription_json()
    assert client.post("/push/subscriptions", headers=student, json=body).status_code == 422


# ---------------- En la cola ----------------
def _subscribe(db, user, device):
    sub = PushSubscription(
        user_id=user.id,
        endpoint=device.endpoint,
        p256dh=device.subscription_json()["keys"]["p256dh"],
        auth=device.subscription_json()["keys"]["auth"],
    )
    db.add(sub)
    db.flush()
    return sub


def test_each_device_gets_its_own_delivery(db, world, vapid):
    _subscribe(db, world["student"], FakeDevice("https://push.example.com/phone"))
    _subscribe(db, world["student"], FakeDevice("https://push.example.com/laptop"))
    notify(db, [world["student"].id], "x", "Título", "Cuerpo")
    db.flush()
    deliveries = db.scalars(select(NotificationDelivery)).all()
    assert sorted(d.channel for d in deliveries) == ["push", "push"]


def test_the_alert_arrives_encrypted_and_signed(db, world, vapid, captured):
    calls, _ = captured
    device = FakeDevice()
    _subscribe(db, world["student"], device)
    notify(db, [world["student"].id], "session_cancelled", "Clase cancelada", "Tu clase de hoy no va.")
    db.flush()

    assert dispatch_pending(db)["sent"] == 1
    [call] = calls
    assert call["url"] == device.endpoint
    assert call["headers"]["content-encoding"] == "aes128gcm"
    assert int(call["headers"]["ttl"]) == 12 * 60 * 60

    payload = device.decrypt(call["data"])
    assert payload["title"] == "Clase cancelada"
    assert payload["body"] == "Tu clase de hoy no va."
    assert payload["url"] == "/" and payload["tag"].startswith("educa-")

    # La firma VAPID es verificable con la clave pública que se publica.
    scheme, params = call["headers"]["Authorization"].split(" ", 1)
    assert scheme == "vapid"
    fields = dict(p.strip().split("=", 1) for p in params.split(","))
    assert fields["k"] == vapid
    public = ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), _unb64(fields["k"]))
    claims = jwt.decode(fields["t"], public, algorithms=["ES256"], audience="https://push.example.com")
    assert claims["sub"] == "mailto:test@educa.com"


def test_a_gone_device_is_forgotten(db, world, vapid, captured):
    _, state = captured
    state["status"] = 410
    _subscribe(db, world["student"], FakeDevice())
    notify(db, [world["student"].id], "x", "t", "b")
    db.flush()

    dispatch_pending(db)
    [delivery] = db.scalars(select(NotificationDelivery)).all()
    assert delivery.status == DeliveryStatus.failed
    assert db.scalar(select(PushSubscription)) is None


def test_a_busy_push_service_is_retried(db, world, vapid, captured):
    _, state = captured
    state["status"] = 503
    _subscribe(db, world["student"], FakeDevice())
    notify(db, [world["student"].id], "x", "t", "b")
    db.flush()

    dispatch_pending(db)
    [delivery] = db.scalars(select(NotificationDelivery)).all()
    assert delivery.status == DeliveryStatus.pending and delivery.attempts == 1
    assert db.scalar(select(PushSubscription)) is not None


def test_long_bodies_are_trimmed_to_fit(db, world, vapid, captured):
    calls, _ = captured
    device = FakeDevice()
    sub = _subscribe(db, world["student"], device)
    send_push(sub, title="t", body="x" * 5000, url="/", tag="t")
    body = device.decrypt(calls[0]["data"])["body"]
    assert len(body) == 1000 and body.endswith("…")
