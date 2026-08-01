"""Backfill `held` for sessions that already have a register.

`SessionStatus.held` existed from the first migration but nothing ever wrote it,
so every session in an existing database sits at `scheduled` regardless of
whether it happened. Reports worked around that by computing
`realizadas = total − canceladas`, which counted classes still in the future as
taught.

Now that taking attendance marks a session `held`, the reports read the status
directly — and without this backfill every historical report would drop to zero
sessions held the moment that change ships.

The evidence used is the one the system actually has: a session with at least
one attendance mark is a session a teacher stood in front of. Sessions with no
register are deliberately left `scheduled`; nobody recorded that they happened,
and inventing that is worse than reporting them as pending.

Revision ID: a1b2c3d4e5f7
Revises: e8f9a0b1c2d3
"""

from alembic import op

revision = "a1b2c3d4e5f7"
down_revision = "e8f9a0b1c2d3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE class_sessions
        SET status = 'held'
        WHERE status = 'scheduled'
          AND EXISTS (
              SELECT 1 FROM attendance
              WHERE attendance.session_id = class_sessions.id
          )
        """
    )


def downgrade() -> None:
    # Only the rows this migration could have touched: a session marked `held`
    # that carries a register. One marked `held` without one was not ours.
    op.execute(
        """
        UPDATE class_sessions
        SET status = 'scheduled'
        WHERE status = 'held'
          AND EXISTS (
              SELECT 1 FROM attendance
              WHERE attendance.session_id = class_sessions.id
          )
        """
    )
