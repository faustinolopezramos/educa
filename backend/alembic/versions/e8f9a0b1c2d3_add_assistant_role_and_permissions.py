"""add assistant role and permissions column to users

Revision ID: e8f9a0b1c2d3
Revises: 7c3d4e5f6a7b
Create Date: 2026-07-30 23:38:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "e8f9a0b1c2d3"
down_revision: Union[str, None] = "7c3d4e5f6a7b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'assistant'"))
    op.add_column("users", sa.Column("permissions", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "permissions")
