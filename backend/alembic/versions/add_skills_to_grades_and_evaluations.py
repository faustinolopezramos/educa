"""add skills to grades and evaluations

Revision ID: add_skills_to_grades_and_evaluations
Revises: drop_certificates_table
Create Date: 2026-09-15 13:45:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "add_skills_grades_evaluations"
down_revision: Union[str, None] = "drop_certificates_table"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE alembic_version ALTER COLUMN version_num TYPE VARCHAR(64)")
    op.add_column("grades", sa.Column("skill", sa.String(length=50), nullable=True))
    op.create_index(op.f("ix_grades_skill"), "grades", ["skill"], unique=False)
    op.add_column("course_evaluations", sa.Column("skill", sa.String(length=50), nullable=True))


def downgrade() -> None:
    op.drop_column("course_evaluations", "skill")
    op.drop_index(op.f("ix_grades_skill"), table_name="grades")
    op.drop_column("grades", "skill")
