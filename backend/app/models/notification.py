from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Notification(Base):
    """An in-app message for one user (an outbox row).

    Kept deliberately simple: a recipient, a kind (for the icon/filter), a title
    and body, and a read marker. `data` keeps the event's facts (course, dates)
    for channels that cannot send free text — a WhatsApp template takes
    parameters, not a paragraph. Each channel it leaves the app through is a
    `NotificationDelivery`.
    """

    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(primary_key=True)
    recipient_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    kind: Mapped[str] = mapped_column(String(40))
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text)
    data: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    read_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )

    deliveries: Mapped[list["NotificationDelivery"]] = relationship(
        back_populates="notification", cascade="all, delete-orphan"
    )


class DeliveryChannel:
    email = "email"
    whatsapp = "whatsapp"


class DeliveryStatus:
    pending = "pending"
    sent = "sent"
    # Se agotaron los intentos, o el proveedor rechazó el envío de forma que
    # reintentar no lo arregla (plantilla inexistente, número inválido).
    failed = "failed"
    # Llevaba demasiado en la cola: avisar hoy de la clase cancelada de ayer
    # confunde más de lo que informa.
    expired = "expired"


class NotificationDelivery(Base):
    """One attempt-tracked send of a notification through an external channel.

    Written in the same transaction as the notification, so a message goes out
    if and only if the change that raised it was committed; a dispatcher drains
    the pending rows afterwards (`app.services.delivery`). The destination is a
    snapshot: editing the phone later does not redirect a queued message.
    """

    __tablename__ = "notification_deliveries"
    __table_args__ = (
        Index("ix_notification_deliveries_due", "status", "next_attempt_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    notification_id: Mapped[int] = mapped_column(
        ForeignKey("notifications.id", ondelete="CASCADE"), index=True
    )
    channel: Mapped[str] = mapped_column(String(16))
    destination: Mapped[str] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(
        String(16), default=DeliveryStatus.pending, server_default=DeliveryStatus.pending
    )
    attempts: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    provider_message_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    next_attempt_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    sent_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    notification: Mapped[Notification] = relationship(back_populates="deliveries")
