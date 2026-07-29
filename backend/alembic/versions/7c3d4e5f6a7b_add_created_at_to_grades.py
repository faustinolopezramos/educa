"""add created_at to grades

A session grade can be dated through the session it belongs to, but a
course-level grade (`session_id IS NULL` — an exam or a final) has no date
anywhere. Period reports therefore could not filter evaluations at all, and a
*weekly* report ended up folding every exam ever recorded into its at-risk
average.

Existing rows are stamped with the migration time: the real entry date was never
captured and cannot be recovered, and a NULL would have to be special-cased at
every read.

Revision ID: 7c3d4e5f6a7b
Revises: 6b2c3d4e5f6a
Create Date: 2026-07-28 23:10:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "7c3d4e5f6a7b"
down_revision: Union[str, None] = "6b2c3d4e5f6a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "grades",
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index(
        op.f("ix_grades_created_at"), "grades", ["created_at"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_grades_created_at"), table_name="grades")
    op.drop_column("grades", "created_at")
