"""drop certificates table

Revision ID: drop_certificates_table
Revises: 9eb89e990fbb
Create Date: 2026-09-15 12:55:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "drop_certificates_table"
down_revision: Union[str, None] = "9eb89e990fbb"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("DROP TABLE IF EXISTS certificates CASCADE")


def downgrade() -> None:
    op.create_table(
        "certificates",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("enrollment_id", sa.Integer(), nullable=False),
        sa.Column("level_id", sa.Integer(), nullable=False),
        sa.Column("final_score", sa.Float(), nullable=False),
        sa.Column("code", sa.String(length=32), nullable=False),
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
        sa.ForeignKeyConstraint(["level_id"], ["levels.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["issued_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("enrollment_id", name="uq_certificate_enrollment"),
        sa.UniqueConstraint("code", name="uq_certificate_code"),
    )
    op.create_index(op.f("ix_certificates_code"), "certificates", ["code"])
    op.create_index(
        op.f("ix_certificates_enrollment_id"), "certificates", ["enrollment_id"]
    )
