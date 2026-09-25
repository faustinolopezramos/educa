"""barrido semanal de alumnos en riesgo

La alerta de alumnos en riesgo sólo salía si alguien pulsaba el botón. Ahora la
API la lanza sola una vez por semana y academia; `at_risk_sweeps` registra cada
barrido, y su índice único es lo que impide que se lance dos veces.

Revision ID: e5f6a7b8c9d1
Revises: d4e5f6a7b8c0
Create Date: 2026-09-24 00:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e5f6a7b8c9d1"
down_revision: Union[str, None] = "d4e5f6a7b8c0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "at_risk_sweeps",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "tenant_id",
            sa.Integer(),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("week_start", sa.Date(), nullable=False),
        sa.Column("students_flagged", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("notifications_sent", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index(
        "uq_at_risk_sweeps_tenant_week",
        "at_risk_sweeps",
        [sa.text("COALESCE(tenant_id, 0)"), "week_start"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("uq_at_risk_sweeps_tenant_week", table_name="at_risk_sweeps")
    op.drop_table("at_risk_sweeps")
