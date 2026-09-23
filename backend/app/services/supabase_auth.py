"""Validación de tokens de Supabase Auth.

El token que el navegador presenta en `/auth/supabase-login` lo firma Supabase,
no nosotros, así que no basta con leerlo: hay que comprobárselo a quien lo
emitió. Antes se decodificaba con `verify_signature: False`, lo que convertía
"dime quién eres" en "dime quién quieres ser" — bastaba fabricar un JWT con el
correo de un administrador para recibir una sesión suya.

La comprobación se hace contra `GET /auth/v1/user` del propio Supabase, que es
la respuesta autorizada a la única pregunta que importa: *¿este token está vivo
y de quién es?* Frente a validar la firma aquí, esto además:

- rechaza los tokens revocados o de una sesión ya cerrada, cosa que la firma por
  sí sola no puede saber;
- no obliga a mantener sincronizado el material de firma del proyecto (secreto
  compartido o JWKS), que Supabase rota;
- devuelve `email_confirmed_at`, sin el cual enlazar por correo sería confiar en
  que nadie se registre con el correo de otra persona.

Es una llamada de red por inicio de sesión, no por petición: las peticiones
siguientes viajan con el JWT propio de Educa.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

_TIMEOUT_SECONDS = 10.0


@dataclass(frozen=True)
class SupabaseUser:
    """Los datos del usuario que Supabase reconoce tras el token."""

    uid: str
    email: str
    email_confirmed: bool
    full_name: str | None


def is_configured() -> bool:
    return bool(settings.supabase_url and settings.supabase_anon_key)


def fetch_supabase_user(access_token: str) -> SupabaseUser | None:
    """El usuario dueño del token, o None si Supabase no lo reconoce.

    Devuelve None ante cualquier respuesta que no sea un 200 con un usuario
    usable: token falso, caducado, revocado o sin correo. Un fallo de red se
    propaga como excepción, porque "no pude preguntar" no es "no es válido" y
    quien llama debe responder 503, no 401.
    """
    base = settings.supabase_url.rstrip("/")
    response = httpx.get(
        f"{base}/auth/v1/user",
        headers={
            "apikey": settings.supabase_anon_key,
            "Authorization": f"Bearer {access_token}",
        },
        timeout=_TIMEOUT_SECONDS,
    )

    if response.status_code != 200:
        logger.info("Supabase rechazó el token (HTTP %s)", response.status_code)
        return None

    data = response.json()
    uid = data.get("id")
    email = data.get("email")
    if not uid or not email:
        logger.info("Supabase devolvió un usuario sin id o sin correo")
        return None

    metadata = data.get("user_metadata") or {}
    return SupabaseUser(
        uid=str(uid),
        email=str(email).strip().lower(),
        email_confirmed=bool(data.get("email_confirmed_at")),
        full_name=metadata.get("full_name") or metadata.get("name"),
    )
