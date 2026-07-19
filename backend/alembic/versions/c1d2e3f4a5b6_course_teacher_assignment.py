"""explicit course↔teacher assignment

Revision ID: c1d2e3f4a5b6
Revises: b7c8d9e0f1a2
Create Date: 2026-07-16 09:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c1d2e3f4a5b6"
down_revision: Union[str, None] = "b7c8d9e0f1a2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Until now "teaches" was derived from schedules; make it explicit and seed the
# new table from the teacher/course pairs the schedules already imply, so no
# existing authorization silently changes.
_BACKFILL = """
INSERT INTO course_teachers (course_id, teacher_id, is_lead)
SELECT DISTINCT course_id, teacher_id, false FROM schedules
ON CONFLICT ON CONSTRAINT uq_course_teacher DO NOTHING
"""


def upgrade() -> None:
    op.create_table(
        "course_teachers",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("course_id", sa.Integer(), nullable=False),
        sa.Column("teacher_id", sa.Integer(), nullable=False),
        sa.Column("is_lead", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.ForeignKeyConstraint(["course_id"], ["courses.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["teacher_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("course_id", "teacher_id", name="uq_course_teacher"),
    )
    op.create_index(
        op.f("ix_course_teachers_course_id"), "course_teachers", ["course_id"]
    )
    op.create_index(
        op.f("ix_course_teachers_teacher_id"), "course_teachers", ["teacher_id"]
    )
    op.execute(_BACKFILL)


def downgrade() -> None:
    op.drop_index(op.f("ix_course_teachers_teacher_id"), table_name="course_teachers")
    op.drop_index(op.f("ix_course_teachers_course_id"), table_name="course_teachers")
    op.drop_table("course_teachers")
