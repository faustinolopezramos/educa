"""importes en NUMERIC(12,2) e historial de tarifas docentes

El dinero estaba en `double precision`: los importes no se guardaban exactos y
las sumas arrastraban el error (0.1 + 0.2 ≠ 0.3), que en un saldo de alumno se
lee como un descuadre sin causa. `NUMERIC(12,2)` guarda céntimos exactos.

La nómina, además, leía siempre la tarifa *actual* del profesor, así que subirle
el precio por hora reescribía hacia atrás liquidaciones ya pagadas.
`teacher_rates` guarda desde cuándo rige cada tarifa, y cada sesión se paga con
la que estaba vigente el día que se impartió.

Revision ID: f1a2b3c4d5e6
Revises: add_supabase_uid_to_users
Create Date: 2026-09-22 00:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f1a2b3c4d5e6"
down_revision: Union[str, None] = "add_supabase_uid_to_users"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# (tabla, columna, admite NULL)
_MONEY_COLUMNS = [
    ("payments", "amount", False),
    ("invoices", "total_amount", False),
    ("enrollments", "amount", False),
    ("users", "hourly_rate", True),
]


def upgrade() -> None:
    for table, column, nullable in _MONEY_COLUMNS:
        # `USING round(...)` fija el valor que ya había al céntimo más cercano:
        # es la única lectura posible de un float que "casi" es 12.30.
        op.alter_column(
            table,
            column,
            type_=sa.Numeric(12, 2),
            existing_type=sa.Float(),
            nullable=nullable,
            postgresql_using=f"round({column}::numeric, 2)",
        )

    op.create_table(
        "teacher_rates",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=True),
        sa.Column("teacher_id", sa.Integer(), nullable=False),
        sa.Column("hourly_rate", sa.Numeric(12, 2), nullable=False),
        sa.Column("effective_from", sa.Date(), nullable=False),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["teacher_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        # Una sola tarifa por profesor y fecha de entrada en vigor: dos filas
        # con la misma fecha harían indeterminado cuál se aplica.
        sa.UniqueConstraint("teacher_id", "effective_from", name="uq_teacher_rate_from"),
    )
    op.create_index(
        op.f("ix_teacher_rates_teacher_id"), "teacher_rates", ["teacher_id"], unique=False
    )
    op.create_index(
        op.f("ix_teacher_rates_tenant_id"), "teacher_rates", ["tenant_id"], unique=False
    )

    # La tarifa que cada profesor tiene hoy pasa a ser su primera tarifa
    # histórica, con una fecha anterior a cualquier sesión registrada: sin esta
    # fila, las liquidaciones ya emitidas pasarían a valer cero.
    op.execute(
        """
        INSERT INTO teacher_rates (tenant_id, teacher_id, hourly_rate, effective_from)
        SELECT tenant_id, id, COALESCE(hourly_rate, 0), DATE '2000-01-01'
        FROM users
        WHERE role = 'teacher'
        """
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_teacher_rates_tenant_id"), table_name="teacher_rates")
    op.drop_index(op.f("ix_teacher_rates_teacher_id"), table_name="teacher_rates")
    op.drop_table("teacher_rates")

    for table, column, nullable in _MONEY_COLUMNS:
        op.alter_column(
            table,
            column,
            type_=sa.Float(),
            existing_type=sa.Numeric(12, 2),
            nullable=nullable,
            postgresql_using=f"{column}::double precision",
        )
