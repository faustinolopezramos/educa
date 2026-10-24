"""add_ludi_addon_to_tenants

Revision ID: g1a2b3c4d5e6
Revises: e40209ef8d8d
Create Date: 2026-10-22 22:40:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "g1a2b3c4d5e6"
down_revision = "e40209ef8d8d"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "tenants",
        sa.Column("has_ludi_addon", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "tenants",
        sa.Column("ludi_requested", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "tenants",
        sa.Column("ludi_requested_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "tenants",
        sa.Column("ludi_modules", sa.JSON(), nullable=False, server_default=sa.text("'[]'::json")),
    )


def downgrade() -> None:
    op.drop_column("tenants", "ludi_modules")
    op.drop_column("tenants", "ludi_requested_at")
    op.drop_column("tenants", "ludi_requested")
    op.drop_column("tenants", "has_ludi_addon")
