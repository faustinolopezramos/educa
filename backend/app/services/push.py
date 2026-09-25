"""Avisos push del navegador (Web Push, con claves VAPID).

Cada dispositivo suscrito recibe el mismo aviso que la campana: título, texto y
a dónde llevar al tocarlo. El cifrado y la firma los hace `pywebpush`; aquí sólo
se decide qué mandar y qué hacer con la respuesta del servicio de push (el de
Google, Apple o Mozilla, según el navegador).
"""

from __future__ import annotations

import base64
import json

import requests
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from pywebpush import WebPushException, webpush

from app.core.config import settings
from app.models import PushSubscription
from app.services.email import DeliveryError

# Lo que el servicio de push guarda el aviso si el dispositivo está apagado.
# El mismo horizonte que la cola: pasado medio día, el aviso ya no sirve.
TTL_SECONDS = 12 * 60 * 60
# Los servicios de push aceptan unos 4 KB cifrados; el texto se recorta antes.
MAX_BODY_CHARS = 1000


def push_configured() -> bool:
    return bool(settings.vapid_public_key.strip() and settings.vapid_private_key.strip())


def _b64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def generate_vapid_keys() -> tuple[str, str]:
    """Un par nuevo (pública, privada) en el formato que esperan navegador y pywebpush."""
    key = ec.generate_private_key(ec.SECP256R1())
    private = key.private_numbers().private_value.to_bytes(32, "big")
    public = key.public_key().public_bytes(
        serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
    )
    return _b64url(public), _b64url(private)


class SubscriptionGone(DeliveryError):
    """El servicio de push dice que ese dispositivo ya no existe (404/410)."""

    def __init__(self, message: str) -> None:
        super().__init__(message, permanent=True)


def send_push(sub: PushSubscription, *, title: str, body: str, url: str, tag: str) -> str:
    """Send one alert to one device. Returns the push service's status; raises DeliveryError."""
    if not push_configured():
        raise DeliveryError("Web Push no está configurado", permanent=True)
    if len(body) > MAX_BODY_CHARS:
        body = body[: MAX_BODY_CHARS - 1] + "…"
    payload = json.dumps({"title": title, "body": body, "url": url, "tag": tag})
    try:
        resp = webpush(
            subscription_info={
                "endpoint": sub.endpoint,
                "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
            },
            data=payload,
            vapid_private_key=settings.vapid_private_key,
            # Un dict nuevo por envío: webpush le añade `aud` y `exp`, y
            # reutilizarlo firmaría el siguiente con la audiencia del anterior.
            vapid_claims={"sub": settings.vapid_subject},
            ttl=TTL_SECONDS,
            timeout=15,
        )
    except WebPushException as exc:
        status = exc.response.status_code if exc.response is not None else None
        if status in (404, 410):
            raise SubscriptionGone(f"HTTP {status}: la suscripción ya no existe") from exc
        permanent = status is not None and status < 500 and status != 429
        raise DeliveryError(f"HTTP {status}: {exc.message}", permanent=permanent) from exc
    except requests.RequestException as exc:
        raise DeliveryError(f"{type(exc).__name__}: {exc}") from exc
    return str(resp.status_code)
