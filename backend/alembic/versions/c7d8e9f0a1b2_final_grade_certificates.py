"""passing score, evaluation weights, level certificates

Revision ID: c7d8e9f0a1b2
Revises: b6c7d8e9f0a1
Create Date: 2026-07-16 16:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c7d8e9f0a1b2"
down_revision: Union[str, None] = "b6c7d8e9f0a1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "courses",
        sa.Column(
            "passing_score", sa.Float(), nullable=False, server_default="6.0"
        ),
    )

    op.create_table(
        "course_evaluations",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("course_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=150), nullable=False),
        sa.Column("weight", sa.Float(), nullable=False, server_default="1.0"),
        sa.ForeignKeyConstraint(["course_id"], ["courses.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("course_id", "name", name="uq_course_evaluation_name"),
    )
    op.create_index(
        op.f("ix_course_evaluations_course_id"), "course_evaluations", ["course_id"]
    )

    op.create_table(
        "certificates",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("enrollment_id", sa.Integer(), nullable=False),
        sa.Column("level_id", sa.Integer(), nullable=False),
        sa.Column("final_score", sa.Float(), nullable=False),
        sa.Column("code", sa.String(length=32), nullable=False),
        sa.Column(
            "issued_at", sa.DateTime(timezone=True), server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("issued_by", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["enrollment_id"], ["enrollments.id"], ondelete="CASCADE"),
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


def downgrade() -> None:
    op.drop_index(op.f("ix_certificates_enrollment_id"), table_name="certificates")
    op.drop_index(op.f("ix_certificates_code"), table_name="certificates")
    op.drop_table("certificates")
    op.drop_index(
        op.f("ix_course_evaluations_course_id"), table_name="course_evaluations"
    )
    op.drop_table("course_evaluations")
    op.drop_column("courses", "passing_score")
