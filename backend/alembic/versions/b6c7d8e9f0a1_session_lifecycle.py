"""academic holidays + session cancel/reschedule

Revision ID: b6c7d8e9f0a1
Revises: a5b6c7d8e9f0
Create Date: 2026-07-16 15:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b6c7d8e9f0a1"
down_revision: Union[str, None] = "a5b6c7d8e9f0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "academic_holidays",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("date", name="uq_holiday_date"),
    )
    op.create_index(
        op.f("ix_academic_holidays_date"), "academic_holidays", ["date"]
    )

    op.add_column(
        "class_sessions", sa.Column("cancel_reason", sa.String(length=255), nullable=True)
    )
    op.add_column(
        "class_sessions", sa.Column("origin_session_id", sa.Integer(), nullable=True)
    )
    op.create_foreign_key(
        "fk_class_sessions_origin",
        "class_sessions",
        "class_sessions",
        ["origin_session_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_class_sessions_origin", "class_sessions", type_="foreignkey")
    op.drop_column("class_sessions", "origin_session_id")
    op.drop_column("class_sessions", "cancel_reason")
    op.drop_index(op.f("ix_academic_holidays_date"), table_name="academic_holidays")
    op.drop_table("academic_holidays")
