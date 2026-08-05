"""Decoupled Email Notification Service.

Supports real SMTP delivery if configured in environment settings, with fallback
to structured logging in development/test environments.
"""

from __future__ import annotations

import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.core.config import settings

logger = logging.getLogger(__name__)


def send_email(
    *,
    to_email: str,
    subject: str,
    body_text: str,
    body_html: str | None = None,
) -> bool:
    """Send an email notification to `to_email`.

    Returns True if sent or logged successfully.
    """
    smtp_host = getattr(settings, "SMTP_HOST", None)
    smtp_port = getattr(settings, "SMTP_PORT", 587)
    smtp_user = getattr(settings, "SMTP_USER", None)
    smtp_pass = getattr(settings, "SMTP_PASSWORD", None)
    email_from = getattr(settings, "EMAIL_FROM", "notificaciones@educa.com")

    if not smtp_host or not smtp_user:
        # Development / Fallback mode: log email payload
        logger.info(
            f"[EMAIL MOCK] To: {to_email} | Subject: {subject} | Body: {body_text[:100]}..."
        )
        return True

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = email_from
        msg["To"] = to_email

        msg.attach(MIMEText(body_text, "plain", "utf-8"))
        if body_html:
            msg.attach(MIMEText(body_html, "html", "utf-8"))

        with smtplib.SMTP(smtp_host, smtp_port, timeout=10) as server:
            server.starttls()
            server.login(smtp_user, smtp_pass)
            server.sendmail(email_from, [to_email], msg.as_string())

        logger.info(f"Email sent successfully to {to_email}")
        return True
    except Exception as exc:
        logger.error(f"Failed to send email to {to_email}: {exc}")
        return False
