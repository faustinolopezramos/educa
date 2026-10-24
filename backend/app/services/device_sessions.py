"""Servicio para gestión de sesiones de dispositivos."""

from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from typing import Optional
from user_agents import parse as parse_user_agent

from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from app.models import DeviceSession, RefreshSession, User
from app.core.security import decode_token


def parse_device_info(user_agent: str | None, ip: str | None) -> tuple[str | None, str | None]:
    """Extrae nombre del dispositivo y ubicación aproximada del user agent e IP."""
    if not user_agent:
        return None, None

    try:
        ua = parse_user_agent(user_agent)
        browser = ua.browser.family
        os = ua.os.family
        device = ua.device.family

        # Construir nombre amigable
        parts = []
        if browser:
            parts.append(browser)
        if os:
            parts.append(f"en {os}")
        if device and device != "Other":
            parts.append(f"({device})")

        device_name = " ".join(parts) if parts else "Dispositivo desconocido"

        # La ubicación requeriría un servicio de geolocalización IP
        # Por ahora devolvemos None, se puede extender con MaxMind/ipapi
        location = None

        return device_name, location
    except Exception:
        return "Dispositivo desconocido", None


def create_device_session(
    db: Session,
    user: User,
    refresh_jti: str,
    user_agent: str | None,
    ip: str | None,
) -> DeviceSession:
    """Crea o actualiza una sesión de dispositivo."""
    device_name, location = parse_device_info(user_agent, ip)

    # Buscar si ya existe una sesión con este refresh_jti
    existing = db.scalar(
        select(DeviceSession).where(DeviceSession.refresh_jti == refresh_jti)
    )

    if existing:
        # Actualizar última actividad
        existing.last_used_at = datetime.now(timezone.utc)
        existing.ip_address = ip or existing.ip_address
        if device_name:
            existing.device_name = device_name
        if location:
            existing.location = location
        db.flush()
        return existing

    # Crear nueva sesión
    session = DeviceSession(
        user_id=user.id,
        refresh_jti=refresh_jti,
        user_agent=user_agent,
        ip_address=ip,
        device_name=device_name,
        location=location,
    )
    db.add(session)
    db.flush()
    return session


def get_user_device_sessions(db: Session, user_id: int) -> list[DeviceSession]:
    """Obtiene todas las sesiones de dispositivo activas de un usuario."""
    return list(
        db.scalars(
            select(DeviceSession)
            .where(DeviceSession.user_id == user_id)
            .where(DeviceSession.revoked_at.is_(None))
            .order_by(DeviceSession.last_used_at.desc())
        ).all()
    )


def get_device_session(db: Session, session_id: int, user_id: int) -> DeviceSession | None:
    """Obtiene una sesión de dispositivo específica."""
    return db.scalar(
        select(DeviceSession)
        .where(DeviceSession.id == session_id)
        .where(DeviceSession.user_id == user_id)
    )


def rotate_device_session(db: Session, user_id: int, old_jti: str | None, new_jti: str) -> None:
    """Hace que la sesión de dispositivo siga al refresh token que se acaba de rotar."""
    if not old_jti:
        return
    db.execute(
        update(DeviceSession)
        .where(DeviceSession.user_id == user_id, DeviceSession.refresh_jti == old_jti)
        .values(refresh_jti=new_jti, last_used_at=datetime.now(timezone.utc))
    )


def _revoke_refresh_sessions(db: Session, user_id: int, jtis: list[str] | None = None, keep: str | None = None) -> None:
    """Mata los refresh tokens que sostienen esas sesiones.

    Marcar la fila del dispositivo no cerraba nada: el refresh token seguía
    canjeándose por tokens nuevos. Lo que cierra una sesión es su `RefreshSession`.
    (El access token vigente caduca solo, en `jwt_expire_minutes`.)
    """
    stmt = (
        update(RefreshSession)
        .where(RefreshSession.user_id == user_id, RefreshSession.revoked_at.is_(None))
        .values(revoked_at=datetime.now(timezone.utc))
    )
    if jtis is not None:
        stmt = stmt.where(RefreshSession.jti.in_(jtis))
    if keep is not None:
        stmt = stmt.where(RefreshSession.jti != keep)
    db.execute(stmt)


def is_explicitly_revoked(db: Session, user_id: int, jti: str) -> bool:
    """Si ese refresh token pertenece a un dispositivo que su dueño cerró.

    Un token *rotado* ya no tiene sesión de dispositivo (ésta pasó a su sucesor),
    así que sólo los cerrados a propósito cumplen esto.
    """
    return (
        db.scalar(
            select(DeviceSession.id)
            .where(DeviceSession.user_id == user_id)
            .where(DeviceSession.refresh_jti == jti)
            .where(DeviceSession.revoked_at.is_not(None))
        )
        is not None
    )


def revoke_device_session(db: Session, session_id: int, user_id: int) -> bool:
    """Revoca una sesión de dispositivo específica, y con ella su refresh token."""
    row = db.scalar(
        select(DeviceSession)
        .where(DeviceSession.id == session_id)
        .where(DeviceSession.user_id == user_id)
        .where(DeviceSession.revoked_at.is_(None))
    )
    if row is None:
        return False
    row.revoked_at = datetime.now(timezone.utc)
    _revoke_refresh_sessions(db, user_id, jtis=[row.refresh_jti])
    return True


def revoke_all_other_device_sessions(db: Session, user_id: int, keep_jti: str) -> int:
    """Revoca todas las sesiones excepto la actual (identificada por jti)."""
    result = db.execute(
        update(DeviceSession)
        .where(DeviceSession.user_id == user_id)
        .where(DeviceSession.revoked_at.is_(None))
        .where(DeviceSession.refresh_jti != keep_jti)
        .values(revoked_at=datetime.now(timezone.utc))
    )
    _revoke_refresh_sessions(db, user_id, keep=keep_jti)
    return result.rowcount


def revoke_all_device_sessions(db: Session, user_id: int) -> int:
    """Revoca todas las sesiones de dispositivo de un usuario."""
    result = db.execute(
        update(DeviceSession)
        .where(DeviceSession.user_id == user_id)
        .where(DeviceSession.revoked_at.is_(None))
        .values(revoked_at=datetime.now(timezone.utc))
    )
    _revoke_refresh_sessions(db, user_id)
    return result.rowcount


def cleanup_old_device_sessions(db: Session, days: int = 30) -> int:
    """Limpia sesiones de dispositivo antiguas revocadas."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    result = db.execute(
        delete(DeviceSession).where(
            DeviceSession.revoked_at.is_not(None),
            DeviceSession.revoked_at < cutoff,
        )
    )
    return result.rowcount


def extract_jti_from_refresh_token(refresh_token: str) -> str | None:
    """Extrae el JTI de un refresh token."""
    payload = decode_token(refresh_token)
    if payload and payload.get("type") == "refresh":
        return payload.get("jti")
    return None