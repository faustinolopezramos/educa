"""Modelos para WebAuthn / Passkeys."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Index, String, Text
from sqlalchemy import true as sa_true
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class WebAuthnCredential(Base):
    """Credencial WebAuthn (passkey) registrada para un usuario."""

    __tablename__ = "webauthn_credentials"
    __table_args__ = (
        Index("ix_webauthn_credentials_user_id", "user_id"),
        Index("ix_webauthn_credentials_credential_id", "credential_id", unique=True),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # ID de la credencial (base64url encoded)
    credential_id: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    # Clave pública en formato COSE
    public_key: Mapped[str] = mapped_column(Text, nullable=False)
    # Sign count para detectar clonación
    sign_count: Mapped[int] = mapped_column(default=0, nullable=False)
    # Nombre amigable dado por el usuario (ej: "Mi iPhone", "YubiKey")
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Tipo de autenticador (platform, cross-platform)
    authenticator_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    # Transports soportados (usb, nfc, ble, internal, hybrid)
    transports: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # AAGUID del autenticador
    aaguid: Mapped[str | None] = mapped_column(String(36), nullable=True)
    # Cuándo se registró
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    # Última vez que se usó
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped["User"] = relationship(back_populates="webauthn_credentials")


class WebAuthnChallenge(Base):
    """Desafío WebAuthn temporal para registro/autenticación."""

    __tablename__ = "webauthn_challenges"
    __table_args__ = (
        Index("ix_webauthn_challenges_user_id", "user_id"),
        Index("ix_webauthn_challenges_expires_at", "expires_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True
    )
    # Challenge en base64url
    challenge: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    # Tipo: "registration" o "authentication"
    challenge_type: Mapped[str] = mapped_column(String(20), nullable=False)
    # Cuándo expira (5 minutos)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    # Datos adicionales para verificación (JSON)
    data: Mapped[str | None] = mapped_column(Text, nullable=True)

    user: Mapped["User | None"] = relationship()