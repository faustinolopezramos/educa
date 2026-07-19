"""add attendance_blocked to enrollment

Revision ID: 97b782876936
Revises: d8e9f0a1b2c3
Create Date: 2026-07-18 21:42:34.164601
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '97b782876936'
down_revision: Union[str, None] = 'd8e9f0a1b2c3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'enrollments',
        sa.Column('attendance_blocked', sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column('enrollments', 'attendance_blocked')
