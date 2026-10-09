"""Servicio WebAuthn / Passkeys para autenticación sin contraseña."""

from __future__ import annotations

import base64
import json
import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

# Compatibilidad: webauthn 1.1.0 espera `from cbor2 import decoder`
import sys
import types
import typing

try:
    import cbor2
    if not hasattr(cbor2, "decoder"):
        _cbor2_decoder = types.ModuleType("cbor2.decoder")
        for _attr in dir(cbor2):
            if not _attr.startswith("__"):
                setattr(_cbor2_decoder, _attr, getattr(cbor2, _attr))
        _cbor2_decoder.loads = cbor2.loads
        _cbor2_decoder.load = cbor2.load
        cbor2.decoder = _cbor2_decoder
        sys.modules["cbor2.decoder"] = _cbor2_decoder
except ImportError:
    pass

# Compatibilidad: webauthn 1.1.0 fue escrito para Pydantic v1 donde campos
# Optional[...] sin default tenían implícito `= None`. En Pydantic v2 esto lanza
# ValidationError al instanciar `att_stmt: AttestationStatement = AttestationStatement()`.
try:
    from pydantic import BaseModel

    _orig_base_model_init = BaseModel.__init__

    def _webauthn_compat_model_init(self, /, **data: typing.Any) -> None:
        if self.__class__.__module__.startswith("webauthn"):
            fields = getattr(self.__class__, "model_fields", None)
            if fields:
                for field_name, field_info in fields.items():
                    if field_name not in data:
                        annot = field_info.annotation
                        origin = getattr(annot, "__origin__", None)
                        args = getattr(annot, "__args__", ())
                        if (
                            origin is typing.Union
                            or (hasattr(types, "UnionType") and origin is types.UnionType)
                            or str(origin) in ("typing.Union", "types.UnionType")
                        ) and type(None) in args:
                            data[field_name] = None
        return _orig_base_model_init(self, **data)

    BaseModel.__init__ = _webauthn_compat_model_init
except Exception:
    pass

try:
    from webauthn import (
        generate_registration_options,
        verify_registration_response,
        generate_authentication_options,
        verify_authentication_response,
        options_to_json,
    )
    from webauthn.helpers import (
        PublicKeyCredentialCreationOptions,
        PublicKeyCredentialRequestOptions,
        PublicKeyCredentialDescriptor,
        AuthenticatorSelectionCriteria,
        AuthenticatorAttachment,
        UserVerificationRequirement,
        ResidentKeyRequirement,
        AttestationConveyancePreference,
        PublicKeyCredentialType,
        AuthenticatorTransport,
    )
    WEBAUTHN_AVAILABLE = True
except Exception as _webauthn_err:
    logger = logging.getLogger(__name__)
    logger.warning("WebAuthn library not available: %s", _webauthn_err)
    WEBAUTHN_AVAILABLE = False
    PublicKeyCredentialCreationOptions = typing.Any  # type: ignore
    PublicKeyCredentialRequestOptions = typing.Any  # type: ignore


from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import WebAuthnCredential, WebAuthnChallenge, User

logger = logging.getLogger(__name__)

# Configuración WebAuthn
RP_ID = settings.webauthn_rp_id if hasattr(settings, 'webauthn_rp_id') else "localhost"
RP_NAME = "EDUCA"
ORIGIN = settings.webauthn_origin if hasattr(settings, 'webauthn_origin') else "http://localhost:5173"
CHALLENGE_TTL_SECONDS = 300  # 5 minutos


def base64url_encode(data: bytes) -> str:
    """Codifica bytes a base64url (sin padding)."""
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def base64url_decode(data: str) -> bytes:
    """Decodifica base64url a bytes."""
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + padding)


def create_challenge(db: Session, user_id: int | None, challenge_type: str) -> str:
    """Crea un nuevo desafío WebAuthn y lo guarda en la BD."""
    challenge_bytes = secrets.token_bytes(32)
    challenge = base64url_encode(challenge_bytes)

    expires_at = datetime.now(timezone.utc) + timedelta(seconds=CHALLENGE_TTL_SECONDS)

    db_challenge = WebAuthnChallenge(
        user_id=user_id,
        challenge=challenge,
        challenge_type=challenge_type,
        expires_at=expires_at,
    )
    db.add(db_challenge)
    db.flush()

    return challenge


def get_challenge(db: Session, challenge: str) -> WebAuthnChallenge | None:
    """Obtiene un desafío válido (no expirado)."""
    return db.scalar(
        select(WebAuthnChallenge)
        .where(WebAuthnChallenge.challenge == challenge)
        .where(WebAuthnChallenge.expires_at > datetime.now(timezone.utc))
    )


def consume_challenge(db: Session, challenge: str) -> WebAuthnChallenge | None:
    """Obtiene y elimina un desafío (one-time use)."""
    chal = get_challenge(db, challenge)
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


def generate_registration_options_webauthn(
    user: User,
    db: Session,
) -> PublicKeyCredentialCreationOptions:
    """Genera opciones para registrar una nueva credencial WebAuthn."""
    if not WEBAUTHN_AVAILABLE:
        raise ValueError("El servicio WebAuthn no está disponible en este servidor")

    # Obtener credenciales existentes para excluir
    existing_creds = db.scalars(
        select(WebAuthnCredential).where(WebAuthnCredential.user_id == user.id)
    ).all()

    exclude_credentials = [
        PublicKeyCredentialDescriptor(
            id=base64url_decode(cred.credential_id),
            type=PublicKeyCredentialType.PUBLIC_KEY,
            transports=[AuthenticatorTransport(t) for t in cred.transports.split(",")] if cred.transports else None,
        )
        for cred in existing_creds
    ]

    options = generate_registration_options(
        rp_id=RP_ID,
        rp_name=RP_NAME,
        user_id=str(user.id).encode(),
        user_name=user.email,
        user_display_name=user.full_name,
        exclude_credentials=exclude_credentials,
        authenticator_selection=AuthenticatorSelectionCriteria(
            authenticator_attachment=AuthenticatorAttachment.PLATFORM,
            resident_key=ResidentKeyRequirement.PREFERRED,
            user_verification=UserVerificationRequirement.PREFERRED,
        ),
        attestation=AttestationConveyancePreference.NONE,
        timeout=60000,  # 60 segundos
    )

    # Guardar challenge
    create_challenge(db, user.id, "registration")

    return options


def verify_registration_response_webauthn(
    db: Session,
    user: User,
    credential: dict,
    expected_challenge: str,
) -> WebAuthnCredential:
    """Verifica la respuesta de registro WebAuthn y guarda la credencial."""
    if not WEBAUTHN_AVAILABLE:
        raise ValueError("El servicio WebAuthn no está disponible en este servidor")

    # Consumir challenge
    chal = consume_challenge(db, expected_challenge)

    if not chal:
        raise ValueError("Challenge inválido o expirado")

    # Verificar respuesta
    verification = verify_registration_response(
        credential=credential,
        expected_challenge=base64url_decode(expected_challenge),
        expected_rp_id=RP_ID,
        expected_origin=ORIGIN,
        require_user_verification=False,
    )

    # Crear credencial
    credential_id = base64url_encode(verification.credential_id)
    public_key = base64url_encode(verification.credential_public_key)

    webauthn_cred = WebAuthnCredential(
        user_id=user.id,
        credential_id=credential_id,
        public_key=public_key,
        sign_count=verification.sign_count,
        name=f"Passkey {datetime.now(timezone.utc).strftime('%d/%m/%Y')}",
        authenticator_type="platform",  # Por ahora asumimos platform
        transports=",".join([t.value for t in credential.get("response", {}).get("transports", [])]) if credential.get("response", {}).get("transports") else None,
        aaguid=verification.aaguid.hex() if verification.aaguid else None,
    )
    db.add(webauthn_cred)
    db.flush()

    return webauthn_cred


def generate_authentication_options_webauthn(
    db: Session,
    user_id: int | None = None,
) -> PublicKeyCredentialRequestOptions:
    """Genera opciones para autenticación WebAuthn."""
    if not WEBAUTHN_AVAILABLE:
        raise ValueError("El servicio WebAuthn no está disponible en este servidor")

    allow_credentials = []

    if user_id:
        # Solo credenciales del usuario específico
        creds = db.scalars(
            select(WebAuthnCredential).where(WebAuthnCredential.user_id == user_id)
        ).all()
        allow_credentials = [
            PublicKeyCredentialDescriptor(
                id=base64url_decode(cred.credential_id),
                type=PublicKeyCredentialType.PUBLIC_KEY,
                transports=[AuthenticatorTransport(t) for t in cred.transports.split(",")] if cred.transports else None,
            )
            for cred in creds
        ]

    options = generate_authentication_options(
        rp_id=RP_ID,
        allow_credentials=allow_credentials if allow_credentials else None,
        user_verification=UserVerificationRequirement.PREFERRED,
        timeout=60000,
    )

    # Guardar challenge
    create_challenge(db, user_id, "authentication")

    return options


def verify_authentication_response_webauthn(
    db: Session,
    credential: dict,
    expected_challenge: str,
) -> WebAuthnCredential:
    """Verifica la respuesta de autenticación WebAuthn."""
    if not WEBAUTHN_AVAILABLE:
        raise ValueError("El servicio WebAuthn no está disponible en este servidor")

    # Consumir challenge
    chal = consume_challenge(db, expected_challenge)
    if not chal:
        raise ValueError("Challenge inválido o expirado")

    # Buscar credencial
    credential_id = credential.get("id")
    if not credential_id:
        raise ValueError("Credential ID faltante")

    webauthn_cred = db.scalar(
        select(WebAuthnCredential).where(WebAuthnCredential.credential_id == credential_id)
    )
    if not webauthn_cred:
        raise ValueError("Credencial no encontrada")

    # Verificar respuesta
    verification = verify_authentication_response(
        credential=credential,
        expected_challenge=base64url_decode(expected_challenge),
        expected_rp_id=RP_ID,
        expected_origin=ORIGIN,
        credential_public_key=base64url_decode(webauthn_cred.public_key),
        credential_current_sign_count=webauthn_cred.sign_count,
        require_user_verification=False,
    )

    # Actualizar sign count y última uso
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


def options_to_json_safe(options: PublicKeyCredentialCreationOptions | PublicKeyCredentialRequestOptions) -> str:
    """Convierte opciones WebAuthn a JSON seguro para el frontend."""
    if not WEBAUTHN_AVAILABLE:
        raise ValueError("El servicio WebAuthn no está disponible en este servidor")
    return options_to_json(options)