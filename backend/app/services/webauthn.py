"""Servicio WebAuthn / Passkeys.

Una passkey es una credencial que *se tiene* y que el autenticador sólo usa tras
verificar a la persona (huella, rostro, PIN): por eso aquí la verificación de
usuario es obligatoria, no «preferida». Con `PREFERRED` un autenticador sin PIN
ni biometría respondía igual, y una passkey robada del dispositivo valía como
contraseña.
"""

from __future__ import annotations

import base64
import logging
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import User, WebAuthnChallenge, WebAuthnCredential

logger = logging.getLogger(__name__)

try:
    from webauthn import (
        generate_authentication_options,
        generate_registration_options,
        options_to_json,
        verify_authentication_response,
        verify_registration_response,
    )
    from webauthn.helpers.structs import (
        AttestationConveyancePreference,
        AuthenticatorAttachment,
        AuthenticatorSelectionCriteria,
        AuthenticatorTransport,
        PublicKeyCredentialDescriptor,
        PublicKeyCredentialType,
        ResidentKeyRequirement,
        UserVerificationRequirement,
    )

    WEBAUTHN_AVAILABLE = True
except Exception as _err:  # pragma: no cover - sólo si la librería falta o es incompatible
    logger.error("La librería WebAuthn no está disponible, las passkeys se desactivan: %s", _err)
    WEBAUTHN_AVAILABLE = False

RP_NAME = "EDUCA"
CHALLENGE_TTL_SECONDS = 300  # 5 minutos

REGISTRATION = "registration"
AUTHENTICATION = "authentication"


def _require_available() -> None:
    if not WEBAUTHN_AVAILABLE:
        raise ValueError("El servicio WebAuthn no está disponible en este servidor")


def base64url_encode(data: bytes) -> str:
    """Codifica bytes a base64url (sin padding)."""
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def base64url_decode(data: str) -> bytes:
    """Decodifica base64url a bytes."""
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + padding)


def create_challenge(db: Session, user_id: int | None, challenge_type: str) -> bytes:
    """Crea y guarda un desafío; devuelve los bytes que hay que dar a la librería.

    El desafío que se guarda tiene que ser el mismo que recibe el navegador. Antes
    cada lado generaba el suyo —la librería uno al armar las opciones, este módulo
    otro al guardarlo—, así que al terminar ningún desafío enviado por el cliente
    coincidía con uno guardado.
    """
    raw = secrets.token_bytes(32)
    db.add(
        WebAuthnChallenge(
            user_id=user_id,
            challenge=base64url_encode(raw),
            challenge_type=challenge_type,
            expires_at=datetime.now(timezone.utc) + timedelta(seconds=CHALLENGE_TTL_SECONDS),
        )
    )
    db.flush()
    return raw


def consume_challenge(
    db: Session,
    challenge: str,
    challenge_type: str,
    user_id: int | None = None,
) -> WebAuthnChallenge | None:
    """Obtiene y elimina un desafío vigente (un solo uso).

    Debe ser del tipo pedido —uno de registro no sirve para autenticar— y, si se
    indica `user_id`, haberse emitido para esa persona.
    """
    stmt = (
        select(WebAuthnChallenge)
        .where(WebAuthnChallenge.challenge == challenge)
        .where(WebAuthnChallenge.challenge_type == challenge_type)
        .where(WebAuthnChallenge.expires_at > datetime.now(timezone.utc))
    )
    if user_id is not None:
        stmt = stmt.where(WebAuthnChallenge.user_id == user_id)
    chal = db.scalar(stmt)
    if chal:
        db.delete(chal)
        db.flush()
    return chal


def cleanup_expired_challenges(db: Session) -> int:
    """Limpia desafíos expirados."""
    result = db.execute(
        delete(WebAuthnChallenge).where(WebAuthnChallenge.expires_at <= datetime.now(timezone.utc))
    )
    return result.rowcount


def _descriptors(creds: list[WebAuthnCredential]) -> list:
    out = []
    for cred in creds:
        transports = None
        if cred.transports:
            transports = []
            for t in cred.transports.split(","):
                try:
                    transports.append(AuthenticatorTransport(t))
                except ValueError:
                    continue  # un transporte desconocido no invalida la credencial
        out.append(
            PublicKeyCredentialDescriptor(
                id=base64url_decode(cred.credential_id),
                type=PublicKeyCredentialType.PUBLIC_KEY,
                transports=transports or None,
            )
        )
    return out


def generate_registration_options_webauthn(user: User, db: Session):
    """Genera opciones para registrar una nueva credencial WebAuthn."""
    _require_available()

    existing = list(
        db.scalars(select(WebAuthnCredential).where(WebAuthnCredential.user_id == user.id)).all()
    )
    challenge = create_challenge(db, user.id, REGISTRATION)

    return generate_registration_options(
        rp_id=settings.webauthn_rp_id,
        rp_name=RP_NAME,
        user_id=str(user.id).encode(),
        user_name=user.email,
        user_display_name=user.full_name,
        challenge=challenge,
        exclude_credentials=_descriptors(existing),
        authenticator_selection=AuthenticatorSelectionCriteria(
            authenticator_attachment=AuthenticatorAttachment.PLATFORM,
            resident_key=ResidentKeyRequirement.PREFERRED,
            user_verification=UserVerificationRequirement.REQUIRED,
        ),
        attestation=AttestationConveyancePreference.NONE,
        timeout=60000,
    )


def verify_registration_response_webauthn(
    db: Session,
    user: User,
    credential: dict,
    expected_challenge: str,
) -> WebAuthnCredential:
    """Verifica la respuesta de registro WebAuthn y guarda la credencial."""
    _require_available()

    if not consume_challenge(db, expected_challenge, REGISTRATION, user_id=user.id):
        raise ValueError("Challenge inválido o expirado")

    try:
        verification = verify_registration_response(
            credential=credential,
            expected_challenge=base64url_decode(expected_challenge),
            expected_rp_id=settings.webauthn_rp_id,
            expected_origin=settings.webauthn_origin,
            require_user_verification=True,
        )
    except Exception as exc:
        # La librería lanza tipos distintos según qué falle (origen, firma, formato…);
        # para quien llama todos son «la respuesta no vale».
        logger.warning("Registro WebAuthn rechazado para el usuario %s: %s", user.id, exc)
        raise ValueError("No se pudo verificar la passkey") from exc

    transports = (credential.get("response") or {}).get("transports") or []
    webauthn_cred = WebAuthnCredential(
        user_id=user.id,
        credential_id=base64url_encode(verification.credential_id),
        public_key=base64url_encode(verification.credential_public_key),
        sign_count=verification.sign_count,
        name=f"Passkey {datetime.now(timezone.utc).strftime('%d/%m/%Y')}",
        authenticator_type="platform",
        transports=",".join(str(t) for t in transports) or None,
        aaguid=str(verification.aaguid) if verification.aaguid else None,
    )
    db.add(webauthn_cred)
    db.flush()
    return webauthn_cred


def generate_authentication_options_webauthn(db: Session, user_id: int | None = None):
    """Genera opciones para autenticación WebAuthn.

    Sin `user_id` es el flujo de credencial detectable (el navegador ofrece las
    passkeys que tiene para este sitio); con él, sólo las de esa persona.
    """
    _require_available()

    allow = None
    if user_id:
        creds = list(
            db.scalars(select(WebAuthnCredential).where(WebAuthnCredential.user_id == user_id)).all()
        )
        allow = _descriptors(creds) or None
    challenge = create_challenge(db, user_id, AUTHENTICATION)

    return generate_authentication_options(
        rp_id=settings.webauthn_rp_id,
        challenge=challenge,
        allow_credentials=allow,
        user_verification=UserVerificationRequirement.REQUIRED,
        timeout=60000,
    )


def verify_authentication_response_webauthn(
    db: Session,
    credential: dict,
    expected_challenge: str,
) -> WebAuthnCredential:
    """Verifica la respuesta de autenticación WebAuthn."""
    _require_available()

    if not consume_challenge(db, expected_challenge, AUTHENTICATION):
        raise ValueError("Challenge inválido o expirado")

    credential_id = credential.get("id")
    if not credential_id:
        raise ValueError("Credential ID faltante")

    webauthn_cred = db.scalar(
        select(WebAuthnCredential).where(WebAuthnCredential.credential_id == credential_id)
    )
    if not webauthn_cred:
        raise ValueError("Credencial no encontrada")

    try:
        verification = verify_authentication_response(
            credential=credential,
            expected_challenge=base64url_decode(expected_challenge),
            expected_rp_id=settings.webauthn_rp_id,
            expected_origin=settings.webauthn_origin,
            credential_public_key=base64url_decode(webauthn_cred.public_key),
            credential_current_sign_count=webauthn_cred.sign_count,
            require_user_verification=True,
        )
    except Exception as exc:
        logger.warning("Autenticación WebAuthn rechazada (credencial %s): %s", webauthn_cred.id, exc)
        raise ValueError("No se pudo verificar la passkey") from exc

    webauthn_cred.sign_count = verification.new_sign_count
    webauthn_cred.last_used_at = datetime.now(timezone.utc)
    db.flush()
    return webauthn_cred


def get_user_credentials(db: Session, user_id: int) -> list[WebAuthnCredential]:
    """Obtiene todas las credenciales WebAuthn de un usuario."""
    return list(
        db.scalars(
            select(WebAuthnCredential)
            .where(WebAuthnCredential.user_id == user_id)
            .order_by(WebAuthnCredential.created_at.desc())
        ).all()
    )


def delete_credential(db: Session, credential_id: int, user_id: int) -> bool:
    """Elimina una credencial WebAuthn."""
    result = db.execute(
        delete(WebAuthnCredential)
        .where(WebAuthnCredential.id == credential_id)
        .where(WebAuthnCredential.user_id == user_id)
    )
    return result.rowcount > 0


def options_to_json_safe(options) -> str:
    """Convierte opciones WebAuthn a JSON para el frontend."""
    _require_available()
    return options_to_json(options)
