"""MFA / 2FA service using TOTP (RFC 6238) with backup codes."""

from __future__ import annotations

import secrets
import logging
from dataclasses import dataclass

import pyotp
import qrcode
import qrcode.image.svg
from io import BytesIO

from app.core.config import settings
from app.core.security import hash_password, verify_password

logger = logging.getLogger(__name__)

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


def generate_secret() -> str:
    """Generate a new TOTP secret (base32)."""
    return pyotp.random_base32()


def generate_backup_codes(count: int = BACKUP_CODE_COUNT, length: int = BACKUP_CODE_LENGTH) -> list[str]:
    """Generate a list of backup codes."""
    return [secrets.token_urlsafe(length)[:length].upper() for _ in range(count)]


def hash_backup_codes(codes: list[str]) -> list[str]:
    """Hash backup codes for storage."""
    return [hash_password(code) for code in codes]


def verify_backup_code(provided_code: str, hashed_codes: list[str]) -> tuple[bool, int]:
    """Verify a backup code against hashed list. Returns (success, remaining_count)."""
    for i, hashed in enumerate(hashed_codes):
        if verify_password(provided_code, hashed):
            remaining = len(hashed_codes) - 1
            return True, remaining
    return False, len(hashed_codes)


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


def verify_totp(secret: str, token: str, valid_window: int = 1) -> bool:
    """Verify a TOTP token. valid_window allows ±N 30-second windows."""
    totp = pyotp.TOTP(secret)
    return totp.verify(token, valid_window=valid_window)


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
) -> MFAVerificationResult:
    """Verify either a TOTP token or a backup code."""
    if not user_mfa_secret:
        return MFAVerificationResult(success=False)

    # Try TOTP first
    if verify_totp(user_mfa_secret, provided_token):
        return MFAVerificationResult(success=True, backup_code_used=False, remaining_backup_codes=len(user_backup_codes or []))

    # Try backup codes
    if user_backup_codes:
        success, remaining = verify_backup_code(provided_token.upper(), user_backup_codes)
        if success:
            return MFAVerificationResult(
                success=True,
                backup_code_used=True,
                remaining_backup_codes=remaining,
            )

    return MFAVerificationResult(success=False, remaining_backup_codes=len(user_backup_codes or []))