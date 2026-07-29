"""add assignments tables and recording_url column

Revision ID: 2f54e796b7b6
Revises: 1e43d685a6a5
Create Date: 2026-07-26 11:20:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "2f54e796b7b6"
down_revision: Union[str, None] = "1e43d685a6a5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add recording_url to class_sessions if not present
    op.add_column(
        "class_sessions",
        sa.Column("recording_url", sa.String(length=500), nullable=True),
    )

    # Create assignments table
    op.create_table(
        "assignments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=True),
        sa.Column("course_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("resource_url", sa.String(length=500), nullable=True),
        sa.Column("due_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["course_id"], ["courses.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_assignments_course_id"), "assignments", ["course_id"], unique=False
    )
    op.create_index(
        op.f("ix_assignments_tenant_id"), "assignments", ["tenant_id"], unique=False
    )

    # Create assignment_submissions table
    op.create_table(
        "assignment_submissions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=True),
        sa.Column("assignment_id", sa.Integer(), nullable=False),
        sa.Column("student_id", sa.Integer(), nullable=False),
        sa.Column("content", sa.Text(), nullable=True),
        sa.Column("submission_url", sa.String(length=500), nullable=True),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "status", sa.String(length=32), nullable=False, server_default="submitted"
        ),
        sa.Column("score", sa.Float(), nullable=True),
        sa.Column("feedback", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(
            ["assignment_id"], ["assignments.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["student_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "assignment_id", "student_id", name="uq_submission_assignment_student"
        ),
    )
    op.create_index(
        op.f("ix_assignment_submissions_assignment_id"),
        "assignment_submissions",
        ["assignment_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_assignment_submissions_student_id"),
        "assignment_submissions",
        ["student_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_assignment_submissions_tenant_id"),
        "assignment_submissions",
        ["tenant_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_assignment_submissions_tenant_id"), table_name="assignment_submissions"
    )
    op.drop_index(
        op.f("ix_assignment_submissions_student_id"),
        table_name="assignment_submissions",
    )
    op.drop_index(
        op.f("ix_assignment_submissions_assignment_id"),
        table_name="assignment_submissions",
    )
    op.drop_table("assignment_submissions")
    op.drop_index(op.f("ix_assignments_tenant_id"), table_name="assignments")
    op.drop_index(op.f("ix_assignments_course_id"), table_name="assignments")
    op.drop_table("assignments")
    op.drop_column("class_sessions", "recording_url")
