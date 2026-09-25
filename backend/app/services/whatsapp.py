"""WhatsApp saliente por la Cloud API de Meta.

Un mensaje que inicia la academia (no una respuesta dentro de las 24 h
siguientes a que escriba el alumno) sólo puede ser una **plantilla aprobada**
por Meta: nombre, idioma y parámetros, nunca texto libre. Por eso cada tipo de
notificación que sale por aquí tiene su plantilla en
`app.services.notifications.WHATSAPP_TEMPLATES`, y las que no la tienen se
quedan en la campana y el correo.
"""

from __future__ import annotations

import re

import httpx

from app.core.config import settings
from app.services.email import DeliveryError

_GRAPH_URL = "https://graph.facebook.com"


def whatsapp_configured() -> bool:
    return bool(settings.whatsapp_token.strip() and settings.whatsapp_phone_number_id.strip())


def normalize_phone(raw: str | None) -> str | None:
    """The number in the digits-only international form Meta expects, or None.

    Phones are typed by hand ("5555-1234", "+502 5555 1234", "00502…"), so a
    number without a country code gets the academy's default one — so a
    foreign number has to be saved with its "+". Anything that does not end up
    as a plausible E.164 number (10–15 digits) is None: better to skip
    WhatsApp for that person than to message a stranger.
    """
    if not raw:
        return None
    text = raw.strip()
    digits = re.sub(r"\D", "", text)
    country = settings.whatsapp_default_country_code
    if text.startswith("+"):
        pass
    elif digits.startswith("00"):
        digits = digits[2:]
    elif not (digits.startswith(country) and len(digits) > 8):
        # Un número local de 8 cifras puede empezar por "502" por casualidad;
        # sólo se da por incluido el prefijo si además sobran cifras.
        digits = country + digits
    if not 10 <= len(digits) <= 15:
        return None
    return digits


def send_template(to: str, template: str, params: list[str]) -> str:
    """Send an approved template. Returns Meta's message id; raises `DeliveryError`."""
    if not whatsapp_configured():
        raise DeliveryError("WhatsApp no está configurado", permanent=True)

    url = (
        f"{_GRAPH_URL}/{settings.whatsapp_api_version}/"
        f"{settings.whatsapp_phone_number_id}/messages"
    )
    payload = {
        "messaging_product": "whatsapp",
        "to": to,
        "type": "template",
        "template": {
            "name": template,
            "language": {"code": settings.whatsapp_template_language},
            "components": [
                {
                    "type": "body",
                    "parameters": [{"type": "text", "text": p} for p in params],
                }
            ],
        },
    }
    try:
        resp = httpx.post(
            url,
            json=payload,
            headers={"Authorization": f"Bearer {settings.whatsapp_token}"},
            timeout=15,
        )
    except httpx.HTTPError as exc:
        raise DeliveryError(f"{type(exc).__name__}: {exc}") from exc

    if resp.status_code >= 400:
        try:
            err = resp.json().get("error", {})
            detail = f"{err.get('code')}: {err.get('message')}"
        except ValueError:
            detail = resp.text[:300]
        # 429 y 5xx son pasajeros; el resto de 4xx (plantilla no aprobada,
        # número que no tiene WhatsApp, parámetros de más) no se arregla solo.
        permanent = resp.status_code != 429 and resp.status_code < 500
        raise DeliveryError(f"HTTP {resp.status_code} — {detail}", permanent=permanent)

    try:
        return resp.json()["messages"][0]["id"]
    except (ValueError, KeyError, IndexError) as exc:
        raise DeliveryError(f"Respuesta inesperada de Meta: {resp.text[:300]}") from exc
