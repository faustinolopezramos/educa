"""Give a course a lifecycle, and an account an on/off switch.

Two states the system needed and did not have:

* `courses.status` — whether a course is being set up, taking enrolments,
  running, finished or shelved. It used to be inferred from `start_date`/
  `end_date`, so a half-built course with no timetable and no teacher looked
  exactly like one about to start, and nothing stopped an admin from seating
  students in it.

* `users.is_active` — a teacher who leaves the academy could not be *deleted*
  (their schedules hold the row) and could not be turned off either, so the only
  way to get them out of the pickers was to reassign every class and then delete
  them, all at once, by hand.

Existing rows are backfilled to the state that keeps today's behaviour: every
course is `open` (they were all enrollable before, and calling them drafts would
retroactively shut enrolment on a live academy) and every account is active.

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f7
"""

import sqlalchemy as sa
from alembic import op

revision = "b2c3d4e5f6a7"
down_revision = "a1b2c3d4e5f7"
branch_labels = None
depends_on = None

COURSE_STATUS = sa.Enum(
    "draft", "open", "in_progress", "closed", "archived", name="course_status"
)


def upgrade() -> None:
    bind = op.get_bind()
    COURSE_STATUS.create(bind, checkfirst=True)

    op.add_column(
        "courses",
        sa.Column(
            "status",
            COURSE_STATUS,
            nullable=False,
            # Everything that exists today is enrollable; anything else would
            # close enrolment on a running academy the moment this deploys.
            server_default="open",
        ),
    )
    # A course whose end date has already passed is finished, not open. This is
    # the one inference worth making, and only where the calendar is explicit.
    op.execute(
        """
        UPDATE courses
        SET status = 'closed'
        WHERE end_date IS NOT NULL AND end_date < CURRENT_DATE
        """
    )

    op.add_column(
        "users",
        sa.Column(
            "is_active", sa.Boolean(), nullable=False, server_default=sa.true()
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "is_active")
    op.drop_column("courses", "status")
    COURSE_STATUS.drop(op.get_bind(), checkfirst=True)
