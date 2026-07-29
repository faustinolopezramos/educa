"""Update enrollment uniqueness constraint to partial index allowing re-enrollment after withdrawal

Revision ID: f9b8c7d6e5f4
Revises: a7b8c9d0e1f2
Create Date: 2026-07-28 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "f9b8c7d6e5f4"
down_revision: Union[str, None] = "a7b8c9d0e1f2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint("uq_enrollment_student_course", "enrollments", type_="unique")
    op.create_index(
        "uq_enrollment_student_course_active",
        "enrollments",
        ["student_id", "course_id"],
        unique=True,
        postgresql_where=sa.text("status != 'withdrawn'"),
    )


def downgrade() -> None:
    op.drop_index("uq_enrollment_student_course_active", table_name="enrollments")
    op.create_unique_constraint(
        "uq_enrollment_student_course", "enrollments", ["student_id", "course_id"]
    )
