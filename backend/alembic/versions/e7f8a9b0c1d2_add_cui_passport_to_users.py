"""add cui_passport to users

Revision ID: e7f8a9b0c1d2
Revises: d1e2f3a4b5c6
Create Date: 2026-07-28 04:49:00.000000

"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "e7f8a9b0c1d2"
down_revision = "f9b8c7d6e5f4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users", sa.Column("cui_passport", sa.String(length=64), nullable=True)
    )
    op.create_index(
        op.f("ix_users_cui_passport"), "users", ["cui_passport"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_users_cui_passport"), table_name="users")
    op.drop_column("users", "cui_passport")
