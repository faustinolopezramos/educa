"""Modelo para sesiones de dispositivos (device sessions)."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text, text
from sqlalchemy import true as sa_true
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class DeviceSession(Base):
    """Sesión de un dispositivo específico para un usuario.

    Permite al usuario ver qué dispositivos tienen sesión activa y revocarlos.
    """

    __tablename__ = "device_sessions"
    __table_args__ = (
        Index("ix_device_sessions_user_id", "user_id"),
        Index("ix_device_sessions_refresh_jti", "refresh_jti", unique=True),
        Index("ix_device_sessions_last_used", "last_used_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # jti del refresh token asociado a esta sesión de dispositivo
    refresh_jti: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    # Información del dispositivo/navegador
    user_agent: Mapped[str | None] = mapped_column(Text, nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)
    # Nombre amigable derivado del user agent (ej: "Chrome en Windows", "Safari en iPhone")
    device_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Ubicación aproximada (ciudad/país) - opcional, para mostrar en UI
    location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Cuándo se creó la sesión (primer login)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    # Última actividad registrada
    last_used_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    # Si la sesión fue revocada manualmente por el usuario
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Si la sesión es la actual (la que está haciendo la petición)
    is_current: Mapped[bool] = mapped_column(default=False, server_default=text("false"), nullable=False)

    user: Mapped["User"] = relationship(back_populates="device_sessions")


# Agregar relación inversa en User model se hace en user.py