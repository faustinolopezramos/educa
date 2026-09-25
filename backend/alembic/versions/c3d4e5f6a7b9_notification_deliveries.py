"""correo y WhatsApp: cola de envíos y preferencias de aviso

Las notificaciones sólo existían dentro de la aplicación. `notification_deliveries`
es la cola de salida por canal (correo, WhatsApp), escrita en la misma
transacción que la notificación; `notifications.data` guarda los datos del
evento que necesitan las plantillas de WhatsApp; y cada usuario decide por qué
canales le llegan los avisos.

Revision ID: c3d4e5f6a7b9
Revises: f1a2b3c4d5e6
Create Date: 2026-09-24 00:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c3d4e5f6a7b9"
down_revision: Union[str, None] = "f1a2b3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("notify_email", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.add_column(
        "users",
        sa.Column(
            "notify_whatsapp", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
    )
    op.add_column("notifications", sa.Column("data", sa.JSON(), nullable=True))

    op.create_table(
        "notification_deliveries",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "notification_id",
            sa.Integer(),
            sa.ForeignKey("notifications.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("channel", sa.String(16), nullable=False),
        sa.Column("destination", sa.String(255), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="pending"),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("provider_message_id", sa.String(128), nullable=True),
        sa.Column(
            "next_attempt_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index(
        "ix_notification_deliveries_notification_id",
        "notification_deliveries",
        ["notification_id"],
    )
    op.create_index(
        "ix_notification_deliveries_due",
        "notification_deliveries",
        ["status", "next_attempt_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_notification_deliveries_due", table_name="notification_deliveries")
    op.drop_index(
        "ix_notification_deliveries_notification_id", table_name="notification_deliveries"
    )
    op.drop_table("notification_deliveries")
    op.drop_column("notifications", "data")
    op.drop_column("users", "notify_whatsapp")
    op.drop_column("users", "notify_email")
