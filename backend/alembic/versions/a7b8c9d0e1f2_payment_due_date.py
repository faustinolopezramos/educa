"""add due_date to payments

Delinquency ("en mora") needs a date to be past. Without one, nothing could
ever set `enrollment.payment_status = overdue`, which left the whole financial
solvency policy — no grades, no report, no certificate for a student in
arrears — permanently inert.

Nullable on purpose: an existing charge has no agreed due date, and inventing
one retroactively would mark historical enrollments delinquent overnight. A
charge with no due date is open-ended and never becomes overdue by itself.

Revision ID: a7b8c9d0e1f2
Revises: 2f54e796b7b6
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a7b8c9d0e1f2"
down_revision: Union[str, None] = "2f54e796b7b6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("payments", sa.Column("due_date", sa.Date(), nullable=True))
    op.create_index("ix_payments_due_date", "payments", ["due_date"])


def downgrade() -> None:
    op.drop_index("ix_payments_due_date", table_name="payments")
    op.drop_column("payments", "due_date")
