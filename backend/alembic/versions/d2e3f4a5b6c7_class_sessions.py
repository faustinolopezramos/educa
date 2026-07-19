"""class_sessions: one occurrence of a schedule on a date

Revision ID: d2e3f4a5b6c7
Revises: c1d2e3f4a5b6
Create Date: 2026-07-16 10:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "d2e3f4a5b6c7"
down_revision: Union[str, None] = "c1d2e3f4a5b6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "class_sessions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("schedule_id", sa.Integer(), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column(
            "status",
            sa.Enum("scheduled", "held", "cancelled", name="session_status"),
            nullable=False,
        ),
        sa.Column("topic", sa.String(length=255), nullable=True),
        sa.ForeignKeyConstraint(["schedule_id"], ["schedules.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("schedule_id", "date", name="uq_session_schedule_date"),
    )
    op.create_index(
        op.f("ix_class_sessions_schedule_id"), "class_sessions", ["schedule_id"]
    )
    op.create_index(op.f("ix_class_sessions_date"), "class_sessions", ["date"])


def downgrade() -> None:
    op.drop_index(op.f("ix_class_sessions_date"), table_name="class_sessions")
    op.drop_index(op.f("ix_class_sessions_schedule_id"), table_name="class_sessions")
    op.drop_table("class_sessions")
    sa.Enum(name="session_status").drop(op.get_bind(), checkfirst=True)
