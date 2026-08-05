"""número de recibo en los movimientos del ledger

`Payment.receipt_number` se añadió al modelo sin su migración, así que la
columna no existía en la base: cualquier consulta a `payments` —y por tanto
matricular, cobrar, facturar o recalcular la morosidad— fallaba con
`UndefinedColumn`. SQLAlchemy selecciona todas las columnas mapeadas, de modo
que ni siquiera hacía falta escribir en ella para romperse.

Nullable, como el modelo: los movimientos ya registrados no tienen número de
recibo y no hay de dónde sacárselo.

Revision ID: d5e6f7a8b9c0
Revises: c3d4e5f6a7b8
"""

from alembic import op
import sqlalchemy as sa

revision = "d5e6f7a8b9c0"
down_revision = "c3d4e5f6a7b8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "payments",
        sa.Column("receipt_number", sa.String(length=64), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("payments", "receipt_number")
