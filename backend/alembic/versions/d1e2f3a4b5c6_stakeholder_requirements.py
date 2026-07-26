"""stakeholder requirements: contact info, nationalities, unified enrollment
status, academic track kind, semi-presencial modality, payments/invoices

Revision ID: d1e2f3a4b5c6
Revises: c9d0e1f2a3b4
Create Date: 2026-07-25 12:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "d1e2f3a4b5c6"
down_revision: Union[str, None] = "c9d0e1f2a3b4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


track_kind = postgresql.ENUM(
    "language", "digital_skill", "business_skill", name="track_kind", create_type=False
)
payment_kind = postgresql.ENUM(
    "charge", "payment", name="payment_kind", create_type=False
)


def upgrade() -> None:
    bind = op.get_bind()

    # ---- Nationalities ----
    op.create_table(
        "nationalities",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )

    # ---- User contact info ----
    op.add_column("users", sa.Column("phone", sa.String(length=32), nullable=True))
    op.add_column("users", sa.Column("address", sa.String(length=255), nullable=True))
    op.add_column("users", sa.Column("nationality_id", sa.Integer(), nullable=True))
    op.create_index(op.f("ix_users_nationality_id"), "users", ["nationality_id"])
    op.create_foreign_key(
        "fk_users_nationality_id_nationalities",
        "users",
        "nationalities",
        ["nationality_id"],
        ["id"],
        ondelete="SET NULL",
    )

    # ---- Academic track kind (Idiomas / Competencias Digitales / Negocios) ----
    postgresql.ENUM(
        "language", "digital_skill", "business_skill", name="track_kind"
    ).create(bind, checkfirst=True)
    op.add_column(
        "languages",
        sa.Column("kind", track_kind, nullable=False, server_default="language"),
    )

    # ---- Modality: add Semi presencial ----
    op.execute("ALTER TYPE modality ADD VALUE IF NOT EXISTS 'semi_presencial'")

    # ---- Enrollment status: unify with the "estatus del alumno" vocabulary ----
    # Renaming existing values preserves current data with no backfill; the two
    # new values are additive.
    op.execute("ALTER TYPE enrollment_status RENAME VALUE 'completed' TO 'certified'")
    op.execute("ALTER TYPE enrollment_status RENAME VALUE 'cancelled' TO 'withdrawn'")
    op.execute(
        "ALTER TYPE enrollment_status ADD VALUE IF NOT EXISTS 'enrolled' BEFORE 'active'"
    )
    op.execute(
        "ALTER TYPE enrollment_status ADD VALUE IF NOT EXISTS 'inactive' AFTER 'active'"
    )

    # ---- Enrollment: código/carné correlativo + cuota ----
    op.execute("CREATE SEQUENCE enrollment_code_seq")
    op.execute("CREATE SEQUENCE invoice_code_seq")
    op.add_column(
        "enrollments", sa.Column("enrollment_code", sa.String(length=32), nullable=True)
    )
    op.add_column(
        "enrollments",
        sa.Column("amount", sa.Float(), nullable=False, server_default="0"),
    )
    # Backfill existing rows (seed/demo data) with a code so the column can be
    # made NOT NULL — real rows created going forward get one at creation time.
    op.execute(
        "UPDATE enrollments SET enrollment_code = "
        "to_char(now(), 'YYYY') || '-' || lpad(nextval('enrollment_code_seq')::text, 5, '0') "
        "WHERE enrollment_code IS NULL"
    )
    op.alter_column("enrollments", "enrollment_code", nullable=False)
    op.create_unique_constraint(
        "uq_enrollments_enrollment_code", "enrollments", ["enrollment_code"]
    )
    op.create_index(
        op.f("ix_enrollments_enrollment_code"), "enrollments", ["enrollment_code"]
    )

    # ---- Payments ledger ----
    postgresql.ENUM("charge", "payment", name="payment_kind").create(
        bind, checkfirst=True
    )
    op.create_table(
        "payments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("enrollment_id", sa.Integer(), nullable=False),
        sa.Column("kind", payment_kind, nullable=False),
        sa.Column("amount", sa.Float(), nullable=False),
        sa.Column("method", sa.String(length=32), nullable=True),
        sa.Column(
            "paid_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("recorded_by", sa.Integer(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(
            ["enrollment_id"], ["enrollments.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["recorded_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_payments_enrollment_id"), "payments", ["enrollment_id"])

    # ---- Invoices (internal receipt) ----
    op.create_table(
        "invoices",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("enrollment_id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(length=32), nullable=False),
        sa.Column("total_amount", sa.Float(), nullable=False),
        sa.Column(
            "issued_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("issued_by", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(
            ["enrollment_id"], ["enrollments.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["issued_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code"),
    )
    op.create_index(op.f("ix_invoices_enrollment_id"), "invoices", ["enrollment_id"])
    op.create_index(op.f("ix_invoices_code"), "invoices", ["code"])


def downgrade() -> None:
    op.drop_index(op.f("ix_invoices_code"), table_name="invoices")
    op.drop_index(op.f("ix_invoices_enrollment_id"), table_name="invoices")
    op.drop_table("invoices")

    op.drop_index(op.f("ix_payments_enrollment_id"), table_name="payments")
    op.drop_table("payments")
    payment_kind.drop(op.get_bind(), checkfirst=True)

    op.drop_index(op.f("ix_enrollments_enrollment_code"), table_name="enrollments")
    op.drop_constraint("uq_enrollments_enrollment_code", "enrollments", type_="unique")
    op.drop_column("enrollments", "amount")
    op.drop_column("enrollments", "enrollment_code")
    op.execute("DROP SEQUENCE IF EXISTS invoice_code_seq")
    op.execute("DROP SEQUENCE IF EXISTS enrollment_code_seq")

    # Enum renames/additions are not reversed: Postgres cannot remove enum
    # values or un-rename them without recreating the type, which would
    # require rewriting every dependent column. Left as a forward-only change.

    op.drop_column("languages", "kind")
    track_kind.drop(op.get_bind(), checkfirst=True)

    op.drop_constraint(
        "fk_users_nationality_id_nationalities", "users", type_="foreignkey"
    )
    op.drop_index(op.f("ix_users_nationality_id"), table_name="users")
    op.drop_column("users", "nationality_id")
    op.drop_column("users", "address")
    op.drop_column("users", "phone")

    op.drop_table("nationalities")
