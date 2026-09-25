"""Draining the outbox: sending queued notification deliveries.

`notify()` only writes rows. This module takes the due ones, one at a time and
under `FOR UPDATE SKIP LOCKED`, so two processes draining at once (the API's
background loop and a manual `python -m app.cli dispatch-notifications`) never
send the same message twice. Each delivery is committed before the next is
claimed: a crash mid-batch loses at most the one in flight.

A delivery that fails is retried with growing waits; one the provider rejects
for good (a bounced address, an unapproved template) is marked failed at once.
Anything still queued after `STALE_AFTER` is expired rather than sent — a
cancellation that arrives the day after the class helps nobody.
"""

from __future__ import annotations

import html
import logging
from collections import Counter
from collections.abc import Callable
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import (
    DeliveryChannel,
    DeliveryStatus,
    Notification,
    NotificationDelivery,
    PushSubscription,
    Tenant,
    User,
)
from app.services.email import DeliveryError, deliver_email
from app.services.notifications import WHATSAPP_TEMPLATES
from app.services.push import SubscriptionGone, send_push
from app.services.whatsapp import send_template

logger = logging.getLogger(__name__)

# Espera antes del intento n+1. Cinco intentos cubren poco más de una hora.
RETRY_DELAYS = (
    timedelta(minutes=1),
    timedelta(minutes=5),
    timedelta(minutes=15),
    timedelta(minutes=45),
)
MAX_ATTEMPTS = len(RETRY_DELAYS) + 1
STALE_AFTER = timedelta(hours=12)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _email_parts(note: Notification) -> tuple[str, str]:
    footer = "Puedes elegir por dónde recibir los avisos en tu perfil."
    link = settings.app_url.strip()
    text = f"{note.body}\n\n"
    if link:
        text += f"Ver en la aplicación: {link}\n\n"
    text += footer
    body_html = (
        '<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;'
        'color:#1f2937;max-width:560px">'
        f'<h2 style="font-size:18px;margin:0 0 12px">{html.escape(note.title)}</h2>'
        f"<p style=\"margin:0 0 16px\">{html.escape(note.body)}</p>"
    )
    if link:
        body_html += (
            f'<p style="margin:0 0 16px"><a href="{html.escape(link, quote=True)}">'
            "Ver en la aplicación</a></p>"
        )
    body_html += f'<p style="margin:24px 0 0;font-size:12px;color:#6b7280">{footer}</p></div>'
    return text, body_html


def _send(db: Session, delivery: NotificationDelivery) -> str:
    """Send one delivery through its channel. Returns the provider's id."""
    note = delivery.notification
    user = db.get(User, note.recipient_id)
    if delivery.channel == DeliveryChannel.email:
        tenant = db.get(Tenant, user.tenant_id) if user and user.tenant_id else None
        text, body_html = _email_parts(note)
        return deliver_email(
            to_email=delivery.destination,
            subject=note.title,
            body_text=text,
            body_html=body_html,
            from_name=tenant.name if tenant else None,
        )
    if delivery.channel == DeliveryChannel.whatsapp:
        build = WHATSAPP_TEMPLATES.get(note.kind)
        if build is None or user is None or not note.data:
            raise DeliveryError(f"Sin plantilla de WhatsApp para «{note.kind}»", permanent=True)
        template, params = build(user, note.data)
        return send_template(delivery.destination, template, params)
    if delivery.channel == DeliveryChannel.push:
        sub = db.get(PushSubscription, int(delivery.destination.removeprefix("push:")))
        if sub is None:
            raise DeliveryError("El dispositivo dejó de recibir avisos", permanent=True)
        try:
            return send_push(
                sub,
                title=note.title,
                body=note.body,
                url="/",
                tag=f"educa-{note.id}",
            )
        except SubscriptionGone:
            # El navegador la dio de baja (desinstaló la app, borró datos): no
            # tiene sentido volver a intentarlo ni con este aviso ni con otros.
            db.delete(sub)
            raise
    raise DeliveryError(f"Canal desconocido: {delivery.channel}", permanent=True)


def _claim_next(db: Session, now: datetime) -> NotificationDelivery | None:
    return db.scalar(
        select(NotificationDelivery)
        .where(
            NotificationDelivery.status == DeliveryStatus.pending,
            NotificationDelivery.next_attempt_at <= now,
        )
        .order_by(NotificationDelivery.next_attempt_at, NotificationDelivery.id)
        .limit(1)
        .with_for_update(skip_locked=True)
    )


def dispatch_pending(
    db: Session, limit: int = 100, send: Callable[[Session, NotificationDelivery], str] = _send
) -> Counter[str]:
    """Send up to `limit` due deliveries. Returns a count per resulting status.

    `send` exists for the tests, which cannot reach an SMTP server or Meta.
    """
    results: Counter[str] = Counter()
    now = _now()

    expired = db.execute(
        update(NotificationDelivery)
        .where(
            NotificationDelivery.status == DeliveryStatus.pending,
            NotificationDelivery.created_at < now - STALE_AFTER,
        )
        .values(status=DeliveryStatus.expired, last_error="Caducó en la cola sin enviarse")
    ).rowcount
    if expired:
        results[DeliveryStatus.expired] += expired
    db.commit()

    for _ in range(limit):
        delivery = _claim_next(db, _now())
        if delivery is None:
            break
        delivery.attempts += 1
        try:
            delivery.provider_message_id = send(db, delivery)
        except DeliveryError as exc:
            delivery.last_error = str(exc)[:2000]
            if exc.permanent or delivery.attempts >= MAX_ATTEMPTS:
                delivery.status = DeliveryStatus.failed
                logger.warning(
                    "Envío %s #%s fallido definitivamente: %s",
                    delivery.channel, delivery.id, exc,
                )
            else:
                delivery.next_attempt_at = _now() + RETRY_DELAYS[delivery.attempts - 1]
                logger.info(
                    "Envío %s #%s falló (intento %s), se reintentará: %s",
                    delivery.channel, delivery.id, delivery.attempts, exc,
                )
        except Exception as exc:  # un fallo inesperado no debe tumbar el bucle
            logger.exception("Error inesperado enviando %s #%s", delivery.channel, delivery.id)
            delivery.last_error = f"{type(exc).__name__}: {exc}"[:2000]
            delivery.status = DeliveryStatus.failed
        else:
            delivery.status = DeliveryStatus.sent
            delivery.sent_at = _now()
            delivery.last_error = None
        results[delivery.status] += 1
        db.commit()
    return results
