"""plan contratado y solicitud de cambio de plan de cada academia

Hasta ahora una academia sólo tenía su cupo (`max_active_students`). El plan
que eligió al registrarse se perdía en la auditoría, y nadie lo veía. Se guarda
el plan vigente y, aparte, el que la academia pidió y el superadmin aún no
resolvió.

El plan de las academias existentes se deduce de su cupo; un cupo que no
coincide con ningún plan queda como "a medida" (NULL).

Revision ID: d3e4f5a6b7c8
Revises: c2d3e4f5a6b7
Create Date: 2026-10-07 00:00:02.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d3e4f5a6b7c8"
down_revision: Union[str, None] = "c2d3e4f5a6b7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("tenants", sa.Column("plan_tier", sa.String(20), nullable=True))
    op.add_column("tenants", sa.Column("requested_plan", sa.String(20), nullable=True))
    op.add_column(
        "tenants",
        sa.Column("plan_requested_at", sa.DateTime(timezone=True), nullable=True),
    )
    # Los cupos de `app.services.plans` en el momento de esta migración.
    op.execute(
        """
        UPDATE tenants SET plan_tier = CASE max_active_students
            WHEN 15 THEN 'free'
            WHEN 100 THEN 'starter'
            WHEN 300 THEN 'pro'
            WHEN 1000 THEN 'scale'
        END
        """
    )


def downgrade() -> None:
    op.drop_column("tenants", "plan_requested_at")
    op.drop_column("tenants", "requested_plan")
    op.drop_column("tenants", "plan_tier")
