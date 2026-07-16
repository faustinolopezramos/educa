"""rooms, teacher qualifications/availability, schedule terms + exclusion constraints

Revision ID: a1b2c3d4e5f6
Revises: d96770d01d1c
Create Date: 2026-07-14 14:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = "d96770d01d1c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# GiST exclusion needs btree_gist for the equality (=) columns to coexist with
# the range overlap (&&) operators in a single index.
_TEACHER_EXCLUDE = """
ALTER TABLE schedules ADD CONSTRAINT ex_schedule_teacher_overlap
EXCLUDE USING gist (
    teacher_id WITH =,
    day_of_week WITH =,
    tsrange(('2000-01-01'::date + start_time), ('2000-01-01'::date + end_time)) WITH &&,
    daterange(term_start, term_end, '[]') WITH &&
)
"""

_ROOM_EXCLUDE = """
ALTER TABLE schedules ADD CONSTRAINT ex_schedule_room_overlap
EXCLUDE USING gist (
    room_id WITH =,
    day_of_week WITH =,
    tsrange(('2000-01-01'::date + start_time), ('2000-01-01'::date + end_time)) WITH &&,
    daterange(term_start, term_end, '[]') WITH &&
)
WHERE (room_id IS NOT NULL)
"""


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS btree_gist")

    # --- rooms ---
    op.create_table(
        "rooms",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("capacity", sa.Integer(), nullable=True),
        sa.Column("is_virtual", sa.Boolean(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )

    # --- teacher language qualifications ---
    op.create_table(
        "teacher_languages",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("teacher_id", sa.Integer(), nullable=False),
        sa.Column("language_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["teacher_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["language_id"], ["languages.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("teacher_id", "language_id", name="uq_teacher_language"),
    )
    op.create_index(
        op.f("ix_teacher_languages_teacher_id"),
        "teacher_languages",
        ["teacher_id"],
    )
    op.create_index(
        op.f("ix_teacher_languages_language_id"),
        "teacher_languages",
        ["language_id"],
    )

    # --- teacher availability windows ---
    op.create_table(
        "teacher_availabilities",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("teacher_id", sa.Integer(), nullable=False),
        sa.Column("day_of_week", sa.Integer(), nullable=False),
        sa.Column("start_time", sa.Time(), nullable=False),
        sa.Column("end_time", sa.Time(), nullable=False),
        sa.ForeignKeyConstraint(["teacher_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_teacher_availabilities_teacher_id"),
        "teacher_availabilities",
        ["teacher_id"],
    )

    # --- users: teaching-hours cap ---
    op.add_column(
        "users", sa.Column("max_weekly_hours", sa.Integer(), nullable=True)
    )

    # --- schedules: room + denormalized term ---
    op.add_column("schedules", sa.Column("room_id", sa.Integer(), nullable=True))
    op.add_column("schedules", sa.Column("term_start", sa.Date(), nullable=True))
    op.add_column("schedules", sa.Column("term_end", sa.Date(), nullable=True))
    op.create_index(
        op.f("ix_schedules_room_id"), "schedules", ["room_id"], unique=False
    )
    op.create_foreign_key(
        "fk_schedules_room_id",
        "schedules",
        "rooms",
        ["room_id"],
        ["id"],
        ondelete="SET NULL",
    )

    # Backfill term bounds from the parent course for existing rows.
    op.execute(
        """
        UPDATE schedules s
        SET term_start = c.start_date, term_end = c.end_date
        FROM courses c
        WHERE s.course_id = c.id
        """
    )

    # --- exclusion constraints (race-proof double-booking guard) ---
    op.execute(_TEACHER_EXCLUDE)
    op.execute(_ROOM_EXCLUDE)


def downgrade() -> None:
    op.execute("ALTER TABLE schedules DROP CONSTRAINT IF EXISTS ex_schedule_room_overlap")
    op.execute(
        "ALTER TABLE schedules DROP CONSTRAINT IF EXISTS ex_schedule_teacher_overlap"
    )

    op.drop_constraint("fk_schedules_room_id", "schedules", type_="foreignkey")
    op.drop_index(op.f("ix_schedules_room_id"), table_name="schedules")
    op.drop_column("schedules", "term_end")
    op.drop_column("schedules", "term_start")
    op.drop_column("schedules", "room_id")

    op.drop_column("users", "max_weekly_hours")

    op.drop_index(
        op.f("ix_teacher_availabilities_teacher_id"),
        table_name="teacher_availabilities",
    )
    op.drop_table("teacher_availabilities")

    op.drop_index(
        op.f("ix_teacher_languages_language_id"), table_name="teacher_languages"
    )
    op.drop_index(
        op.f("ix_teacher_languages_teacher_id"), table_name="teacher_languages"
    )
    op.drop_table("teacher_languages")

    op.drop_table("rooms")
