"""solicitudes de renovación al siguiente nivel

Un alumno graduado pide plaza en un grupo del nivel siguiente; dirección la
aprueba (se abre la matrícula) o la rechaza. Reusa el ENUM `proposal_status`
de las propuestas de ubicación.

Revision ID: a7b8c9d0e1f3
Revises: f6a7b8c9d0e2
Create Date: 2026-09-25 00:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "a7b8c9d0e1f3"
down_revision: Union[str, None] = "f6a7b8c9d0e2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    proposal_status = postgresql.ENUM(
        "pending", "approved", "rejected", name="proposal_status", create_type=False
    )
    op.create_table(
        "renewal_requests",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "student_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "from_enrollment_id",
            sa.Integer(),
            sa.ForeignKey("enrollments.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "course_id",
            sa.Integer(),
            sa.ForeignKey("courses.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("status", proposal_status, nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("review_note", sa.Text(), nullable=True),
        sa.Column(
            "reviewed_by",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "enrollment_id",
            sa.Integer(),
            sa.ForeignKey("enrollments.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_renewal_requests_student_id", "renewal_requests", ["student_id"])
    op.create_index("ix_renewal_requests_course_id", "renewal_requests", ["course_id"])
    op.create_index("ix_renewal_requests_status", "renewal_requests", ["status"])
    op.create_index(
        "uq_renewal_pending_per_enrollment",
        "renewal_requests",
        ["from_enrollment_id"],
        unique=True,
        postgresql_where=sa.text("status = 'pending'"),
    )


def downgrade() -> None:
    op.drop_index("uq_renewal_pending_per_enrollment", table_name="renewal_requests")
    op.drop_index("ix_renewal_requests_status", table_name="renewal_requests")
    op.drop_index("ix_renewal_requests_course_id", table_name="renewal_requests")
    op.drop_index("ix_renewal_requests_student_id", table_name="renewal_requests")
    op.drop_table("renewal_requests")
