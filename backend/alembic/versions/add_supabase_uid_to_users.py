"""add supabase_uid to users

Revision ID: add_supabase_uid_to_users
Revises: phase3_makeup_teacher_payroll
Create Date: 2026-09-17 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "add_supabase_uid_to_users"
down_revision: Union[str, None] = "phase3_makeup_teacher_payroll"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("supabase_uid", sa.String(length=64), nullable=True))
    op.create_index(op.f("ix_users_supabase_uid"), "users", ["supabase_uid"], unique=True)


def downgrade() -> None:
    op.drop_index(op.f("ix_users_supabase_uid"), table_name="users")
    op.drop_column("users", "supabase_uid")
