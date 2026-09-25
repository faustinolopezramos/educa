"""Correo saliente por SMTP.

Antes leía la configuración con `getattr(settings, "SMTP_HOST", None)`, pero
`Settings` no declaraba esos campos e ignora las variables que no conoce: el
correo caía siempre en el modo simulado, por mucho que el entorno lo
configurase. Ahora son campos de verdad (`app/core/config.py`).
"""

from __future__ import annotations

import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formataddr, make_msgid, parseaddr

from app.core.config import settings

logger = logging.getLogger(__name__)


class DeliveryError(Exception):
    """A send that did not go through.

    `permanent` separates "try again later" (timeout, 5xx, rate limit) from
    "retrying will not help" (a rejected address, a template Meta never
    approved), so the dispatcher does not spend its attempts on the latter.
    """

    def __init__(self, message: str, *, permanent: bool = False) -> None:
        super().__init__(message)
        self.permanent = permanent


def email_configured() -> bool:
    return bool(settings.smtp_host.strip())


def deliver_email(
    *,
    to_email: str,
    subject: str,
    body_text: str,
    body_html: str | None = None,
    from_name: str | None = None,
) -> str:
    """Send one message. Returns its Message-ID; raises `DeliveryError`."""
    if not email_configured():
        raise DeliveryError("SMTP no está configurado", permanent=True)

    _, from_address = parseaddr(settings.email_from)
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    # El remitente visible es la academia, no la plataforma: a quien lee
    # "Educa" en su bandeja no le dice de dónde viene el aviso.
    msg["From"] = formataddr((from_name, from_address)) if from_name else settings.email_from
    msg["To"] = to_email
    msg["Message-ID"] = message_id = make_msgid(domain=from_address.split("@")[-1])
    msg.attach(MIMEText(body_text, "plain", "utf-8"))
    if body_html:
        msg.attach(MIMEText(body_html, "html", "utf-8"))

    try:
        if settings.smtp_port == 465:
            server: smtplib.SMTP = smtplib.SMTP_SSL(
                settings.smtp_host, settings.smtp_port, timeout=15
            )
        else:
            server = smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15)
        with server:
            if settings.smtp_port != 465:
                server.starttls()
            if settings.smtp_user:
                server.login(settings.smtp_user, settings.smtp_password)
            server.sendmail(from_address, [to_email], msg.as_string())
    except smtplib.SMTPRecipientsRefused as exc:
        raise DeliveryError(f"Dirección rechazada: {exc}", permanent=True) from exc
    except smtplib.SMTPAuthenticationError as exc:
        # Credenciales malas: reintentar no las arregla, pero tampoco es culpa
        # del destinatario. Se reintenta por si alguien corrige el secreto.
        raise DeliveryError(f"SMTP rechazó las credenciales: {exc}") from exc
    except (smtplib.SMTPException, OSError) as exc:
        raise DeliveryError(f"{type(exc).__name__}: {exc}") from exc
    return message_id


def send_email(
    *,
    to_email: str,
    subject: str,
    body_text: str,
    body_html: str | None = None,
) -> bool:
    """Send an email right away. Returns True if sent or, unconfigured, logged.

    For notifications use `app.services.notifications.notify`, which queues the
    message and retries it; this is for one-off sends that need no record.
    """
    if not email_configured():
        logger.info(
            "[EMAIL MOCK] To: %s | Subject: %s | Body: %s...",
            to_email,
            subject,
            body_text[:100],
        )
        return True
    try:
        deliver_email(
            to_email=to_email, subject=subject, body_text=body_text, body_html=body_html
        )
    except DeliveryError as exc:
        logger.error("Failed to send email to %s: %s", to_email, exc)
        return False
    return True
