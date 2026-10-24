"""MFA / 2FA service using TOTP (RFC 6238) with backup codes."""

from __future__ import annotations

import hmac
import secrets
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import pyotp
import qrcode
import qrcode.image.svg
from io import BytesIO

from cryptography.fernet import InvalidToken

from app.core.config import settings
from app.core.crypto import decrypt, encrypt
from app.core.security import hash_password, verify_password

logger = logging.getLogger(__name__)

# Marca de un secreto TOTP cifrado en la columna. Sin ella el valor es de antes
# del cifrado (o de un entorno sin FERNET_KEY) y se lee tal cual.
_SEALED_PREFIX = "enc:"

BACKUP_CODE_COUNT = 10
BACKUP_CODE_LENGTH = 8
ISSUER_NAME = "EDUCA"


@dataclass(frozen=True)
class MFASetup:
    """Data returned when initiating MFA setup."""
    secret: str
    qr_code_svg: str
    backup_codes: list[str]
    otpauth_url: str


@dataclass(frozen=True)
class MFAVerificationResult:
    """Result of MFA verification."""
    success: bool
    backup_code_used: bool = False
    remaining_backup_codes: int = 0
    # Posición, en la lista guardada, del código de respaldo que se gastó. Quien
    # llama debe quitarlo: un código de respaldo vale una sola vez.
    used_backup_index: int | None = None
    # Ventana del código TOTP aceptado; es lo que hay que guardar en
    # `mfa_last_used` para que ese código no pueda reutilizarse.
    totp_window: datetime | None = None


def seal_secret(secret: str) -> str:
    """El secreto TOTP tal como se guarda: cifrado con Fernet si hay clave.

    Quien lea la tabla `users` (una copia de seguridad, un rol de base de datos
    con demasiado alcance) no debe poder generar códigos de segundo factor. La
    producción exige `FERNET_KEY`; en desarrollo, sin ella, se guarda en claro.
    """
    if not settings.fernet_key.strip() or secret.startswith(_SEALED_PREFIX):
        return secret
    return _SEALED_PREFIX + encrypt(secret)


def open_secret(stored: str | None) -> str | None:
    """El secreto TOTP en claro, o None si no se puede descifrar.

    Una clave equivocada no debe abrir ni romper nada: se trata como «no hay
    secreto», y la verificación falla.
    """
    if not stored:
        return None
    if not stored.startswith(_SEALED_PREFIX):
        return stored
    try:
        return decrypt(stored[len(_SEALED_PREFIX):])
    except (InvalidToken, RuntimeError):
        logger.error("No se pudo descifrar un secreto MFA: ¿cambió FERNET_KEY?")
        return None


def needs_sealing(stored: str | None) -> bool:
    """Si el valor guardado está en claro y ya hay clave para cifrarlo."""
    return bool(
        stored
        and not stored.startswith(_SEALED_PREFIX)
        and settings.fernet_key.strip()
    )


def generate_secret() -> str:
    """Generate a new TOTP secret (base32)."""
    return pyotp.random_base32()


def generate_backup_codes(count: int = BACKUP_CODE_COUNT, length: int = BACKUP_CODE_LENGTH) -> list[str]:
    """Generate a list of backup codes."""
    return [secrets.token_urlsafe(length)[:length].upper() for _ in range(count)]


def hash_backup_codes(codes: list[str]) -> list[str]:
    """Hash backup codes for storage."""
    return [hash_password(code) for code in codes]


def find_backup_code(provided_code: str, hashed_codes: list[str]) -> int | None:
    """Posición del código de respaldo que coincide, o None."""
    for i, hashed in enumerate(hashed_codes):
        if verify_password(provided_code, hashed):
            return i
    return None


def verify_backup_code(provided_code: str, hashed_codes: list[str]) -> tuple[bool, int]:
    """Verify a backup code against hashed list. Returns (success, remaining_count)."""
    index = find_backup_code(provided_code, hashed_codes)
    if index is None:
        return False, len(hashed_codes)
    return True, len(hashed_codes) - 1


def build_otpauth_url(email: str, secret: str, issuer: str = ISSUER_NAME) -> str:
    """Build the otpauth:// URL for QR code."""
    totp = pyotp.TOTP(secret)
    return totp.provisioning_uri(name=email, issuer_name=issuer)


def generate_qr_code_svg(data: str) -> str:
    """Generate QR code as SVG string."""
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=10,
        border=4,
        image_factory=qrcode.image.svg.SvgImage,
    )
    qr.add_data(data)
    qr.make(fit=True)
    img = qr.make_image()
    buffer = BytesIO()
    img.save(buffer)
    return buffer.getvalue().decode("utf-8")


def match_totp(
    secret: str,
    token: str,
    valid_window: int = 1,
    last_used: datetime | None = None,
) -> datetime | None:
    """Inicio de la ventana de 30 s a la que pertenece `token`, o None si no vale.

    `valid_window` admite ±N ventanas por desfase de reloj. Con `last_used` (la
    ventana del último código aceptado de esta cuenta) no se admite ninguna
    ventana igual ni anterior: un código interceptado —por encima del hombro, por
    un teclado espía— no puede reutilizarse mientras siga siendo válido.
    """
    token = (token or "").strip().replace(" ", "")
    totp = pyotp.TOTP(secret)
    last_step = totp.timecode(last_used) if last_used is not None else -1
    now = datetime.now(timezone.utc)
    for offset in range(-valid_window, valid_window + 1):
        step = totp.timecode(now + timedelta(seconds=offset * totp.interval))
        if step <= last_step:
            continue
        if hmac.compare_digest(totp.generate_otp(step), token):
            return datetime.fromtimestamp(step * totp.interval, tz=timezone.utc)
    return None


def verify_totp(
    secret: str,
    token: str,
    valid_window: int = 1,
    last_used: datetime | None = None,
) -> bool:
    """Verify a TOTP token (see `match_totp`)."""
    return match_totp(secret, token, valid_window, last_used) is not None


def create_mfa_setup(email: str) -> MFASetup:
    """Create a new MFA setup with secret, QR code, and backup codes."""
    secret = generate_secret()
    backup_codes = generate_backup_codes()
    otpauth_url = build_otpauth_url(email, secret)
    qr_code_svg = generate_qr_code_svg(otpauth_url)
    return MFASetup(
        secret=secret,
        qr_code_svg=qr_code_svg,
        backup_codes=backup_codes,
        otpauth_url=otpauth_url,
    )


def verify_mfa_token(
    user_mfa_secret: str | None,
    user_backup_codes: list[str] | None,
    provided_token: str,
    last_used: datetime | None = None,
) -> MFAVerificationResult:
    """Verify either a TOTP token or a backup code."""
    secret = open_secret(user_mfa_secret)
    if not secret:
        return MFAVerificationResult(success=False)

    # Try TOTP first
    window = match_totp(secret, provided_token, last_used=last_used)
    if window is not None:
        return MFAVerificationResult(
            success=True,
            backup_code_used=False,
            remaining_backup_codes=len(user_backup_codes or []),
            totp_window=window,
        )

    # Try backup codes. Cada comprobación es un bcrypt por código guardado, así
    # que sólo se intenta con lo que tiene la forma de uno: un código TOTP de 6
    # dígitos no puede serlo, y sin este filtro cada intento costaba 10 bcrypt.
    candidate = provided_token.strip().upper()
    if user_backup_codes and len(candidate) == BACKUP_CODE_LENGTH:
        index = find_backup_code(candidate, user_backup_codes)
        if index is not None:
            return MFAVerificationResult(
                success=True,
                backup_code_used=True,
                remaining_backup_codes=len(user_backup_codes) - 1,
                used_backup_index=index,
            )

    return MFAVerificationResult(success=False, remaining_backup_codes=len(user_backup_codes or []))
