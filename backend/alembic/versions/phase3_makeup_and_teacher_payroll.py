"""phase3 makeup and teacher payroll

Revision ID: phase3_makeup_and_teacher_payroll
Revises: add_skills_to_grades_and_evaluations
Create Date: 2026-09-15 20:50:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "phase3_makeup_and_teacher_payroll"
down_revision: Union[str, None] = "add_skills_to_grades_and_evaluations"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add hourly_rate to users
    op.add_column("users", sa.Column("hourly_rate", sa.Float(), nullable=True, server_default="0.0"))

    # 2. Create make_up_credits table
    op.create_table(
        "make_up_credits",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=True),
        sa.Column("student_id", sa.Integer(), nullable=False),
        sa.Column("enrollment_id", sa.Integer(), nullable=False),
        sa.Column("origin_session_id", sa.Integer(), nullable=True),
        sa.Column("target_session_id", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="available"),
        sa.Column("issued_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("expires_at", sa.Date(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["enrollment_id"], ["enrollments.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["origin_session_id"], ["class_sessions.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["student_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["target_session_id"], ["class_sessions.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_make_up_credits_enrollment_id"), "make_up_credits", ["enrollment_id"], unique=False)
    op.create_index(op.f("ix_make_up_credits_expires_at"), "make_up_credits", ["expires_at"], unique=False)
    op.create_index(op.f("ix_make_up_credits_origin_session_id"), "make_up_credits", ["origin_session_id"], unique=False)
    op.create_index(op.f("ix_make_up_credits_status"), "make_up_credits", ["status"], unique=False)
    op.create_index(op.f("ix_make_up_credits_student_id"), "make_up_credits", ["student_id"], unique=False)
    op.create_index(op.f("ix_make_up_credits_target_session_id"), "make_up_credits", ["target_session_id"], unique=False)
    op.create_index(op.f("ix_make_up_credits_tenant_id"), "make_up_credits", ["tenant_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_make_up_credits_tenant_id"), table_name="make_up_credits")
    op.drop_index(op.f("ix_make_up_credits_target_session_id"), table_name="make_up_credits")
    op.drop_index(op.f("ix_make_up_credits_student_id"), table_name="make_up_credits")
    op.drop_index(op.f("ix_make_up_credits_status"), table_name="make_up_credits")
    op.drop_index(op.f("ix_make_up_credits_origin_session_id"), table_name="make_up_credits")
    op.drop_index(op.f("ix_make_up_credits_expires_at"), table_name="make_up_credits")
    op.drop_index(op.f("ix_make_up_credits_enrollment_id"), table_name="make_up_credits")
    op.drop_table("make_up_credits")
    op.drop_column("users", "hourly_rate")
