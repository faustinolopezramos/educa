"""one attendance row per enrollment/day, one grade per enrollment/evaluation

Revision ID: b7c8d9e0f1a2
Revises: a1b2c3d4e5f6
Create Date: 2026-07-15 20:10:00.000000
"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "b7c8d9e0f1a2"
down_revision: Union[str, None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Existing rows may already contain duplicates (the API used to append a new row
# on every mark/grade). The last write is the one the teacher meant to keep, so
# collapse each group onto its highest id before the constraint goes on.
_DEDUPE_ATTENDANCE = """
DELETE FROM attendance a
USING attendance b
WHERE a.enrollment_id = b.enrollment_id
  AND a.date = b.date
  AND a.id < b.id
"""

_DEDUPE_GRADES = """
DELETE FROM grades a
USING grades b
WHERE a.enrollment_id = b.enrollment_id
  AND a.evaluation_name = b.evaluation_name
  AND a.id < b.id
"""


def upgrade() -> None:
    op.execute(_DEDUPE_ATTENDANCE)
    op.create_unique_constraint(
        "uq_attendance_enrollment_date", "attendance", ["enrollment_id", "date"]
    )

    op.execute(_DEDUPE_GRADES)
    op.create_unique_constraint(
        "uq_grade_enrollment_evaluation", "grades", ["enrollment_id", "evaluation_name"]
    )


def downgrade() -> None:
    op.drop_constraint("uq_grade_enrollment_evaluation", "grades", type_="unique")
    op.drop_constraint("uq_attendance_enrollment_date", "attendance", type_="unique")
