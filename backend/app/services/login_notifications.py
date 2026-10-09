"""Servicio de notificaciones de login nuevo."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.models import DeviceSession, User
from app.services.device_sessions import parse_device_info
from app.services.notifications import notify
from app.services.email import deliver_email

logger = logging.getLogger(__name__)


def is_new_device(
    db: Session,
    user_id: int,
    user_agent: str | None,
    ip: str | None,
) -> bool:
    """Verifica si el dispositivo/IP es nuevo para este usuario."""
    if not user_agent and not ip:
        return False

    # Buscar sesiones existentes con mismo user_agent o IP
    existing = db.query(DeviceSession).filter(
        DeviceSession.user_id == user_id,
        DeviceSession.revoked_at.is_(None),
    ).all()

    for session in existing:
        # Coincidencia por user agent
        if user_agent and session.user_agent == user_agent:
            return False
        # Coincidencia por IP
        if ip and session.ip_address == ip:
            return False

    return True


def send_new_login_notification(
    db: Session,
    user: User,
    user_agent: str | None,
    ip: str | None,
    device_name: str | None,
    location: str | None,
) -> None:
    """Envía notificación de login nuevo si es un dispositivo nuevo."""
    if not is_new_device(db, user.id, user_agent, ip):
        return

    logger.info("New login detected for user %d from IP %s", user.id, ip)

    # Preparar detalles del dispositivo
    device_info = device_name or "Dispositivo desconocido"
    if location:
        device_info += f" ({location})"
    if ip:
        device_info += f" - IP: {ip}"

    now = datetime.now(timezone.utc).strftime("%d/%m/%Y %H:%M")

    # Enviar notificación in-app
    try:
        notify(
            db,
            user_id=user.id,
            kind="new_login",
            title="Nuevo inicio de sesión detectado",
            body=f"Se ha iniciado sesión en tu cuenta desde {device_info} el {now}. Si no fuiste tú, revisa tus sesiones activas y cambia tu contraseña.",
        )
    except Exception as e:
        logger.warning("Failed to send in-app notification for new login: %s", e)

    # Enviar email si el usuario tiene notificaciones por email activadas
    if user.notify_email and user.email:
        try:
            deliver_email(
                to=user.email,
                subject="Nuevo inicio de sesión en tu cuenta EDUCA",
                html_body=f"""
                <p>Hola {user.full_name},</p>
                <p>Se ha detectado un nuevo inicio de sesión en tu cuenta de EDUCA:</p>
                <ul>
                    <li><strong>Dispositivo:</strong> {device_info}</li>
                    <li><strong>Fecha y hora:</strong> {now} (UTC)</li>
                </ul>
                <p>Si fuiste tú, no necesitas hacer nada. Si no reconoces esta actividad:</p>
                <ol>
                    <li>Ve a <strong>Perfil > Sesiones activas</strong> y cierra las sesiones que no reconozcas.</li>
                    <li>Cambia tu contraseña inmediatamente.</li>
                    <li>Activa la autenticación de dos factores (MFA) para mayor seguridad.</li>
                </ol>
                <p>Saludos,<br>El equipo de EDUCA</p>
                """,
            )
        except Exception as e:
            logger.warning("Failed to send email for new login notification: %s", e)

    # Enviar push notification si está disponible
    try:
        from app.services.push import send_push
        send_push(
            user_id=user.id,
            title="Nuevo inicio de sesión",
            body=f"Nueva sesión desde {device_name or 'dispositivo desconocido'}",
            data={"type": "new_login"},
        )
    except Exception as e:
        logger.warning("Failed to send push notification for new login: %s", e)