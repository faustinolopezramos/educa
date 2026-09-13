"""Add denormalized fields and GiST exclusion constraint to class_sessions.

Revision ID: gist_class_session_cons
Revises: f5a6b7c8d9e0
Create Date: 2025-01-09 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'gist_class_session_cons'
down_revision = 'f5a6b7c8d9e0'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add denormalized columns to class_sessions for the exclusion constraint
    op.add_column('class_sessions', sa.Column('teacher_id', sa.Integer(), nullable=True, index=True))
    op.add_column('class_sessions', sa.Column('room_id', sa.Integer(), nullable=True, index=True))
    op.add_column('class_sessions', sa.Column('start_time', sa.Time(), nullable=True))
    op.add_column('class_sessions', sa.Column('end_time', sa.Time(), nullable=True))

    # Populate denormalized fields from schedules
    op.execute("""
        UPDATE class_sessions cs
        SET teacher_id = s.teacher_id,
            room_id = s.room_id,
            start_time = s.start_time,
            end_time = s.end_time
        FROM schedules s
        WHERE cs.schedule_id = s.id
    """)

    # Make teacher_id and start_time/end_time NOT NULL for sessions with schedules
    # (room_id can be NULL for virtual classes)
    op.alter_column('class_sessions', 'teacher_id', nullable=False)
    op.alter_column('class_sessions', 'start_time', nullable=False)
    op.alter_column('class_sessions', 'end_time', nullable=False)

    # Add foreign key constraints
    op.create_foreign_key(
        'fk_class_sessions_teacher_id',
        'class_sessions', 'users',
        ['teacher_id'], ['id'],
        ondelete='RESTRICT'
    )
    op.create_foreign_key(
        'fk_class_sessions_room_id',
        'class_sessions', 'rooms',
        ['room_id'], ['id'],
        ondelete='SET NULL'
    )

    # Create GiST exclusion constraints for teacher and room conflicts
    # Teacher cannot have overlapping sessions on the same date
    op.execute("""
        CREATE EXTENSION IF NOT EXISTS btree_gist
    """)
    # Use tstzrange with date + time cast to timestamp for proper range comparison
    op.execute("""
        ALTER TABLE class_sessions
        ADD CONSTRAINT class_sessions_teacher_no_overlap
        EXCLUDE USING gist (
            teacher_id WITH =,
            date WITH =,
            tstzrange(
                (date + start_time) AT TIME ZONE 'UTC',
                (date + end_time) AT TIME ZONE 'UTC'
            ) WITH &&
        ) WHERE (status != 'cancelled')
    """)

    # Room cannot have overlapping sessions on the same date (only for sessions with room_id)
    op.execute("""
        ALTER TABLE class_sessions
        ADD CONSTRAINT class_sessions_room_no_overlap
        EXCLUDE USING gist (
            room_id WITH =,
            date WITH =,
            tstzrange(
                (date + start_time) AT TIME ZONE 'UTC',
                (date + end_time) AT TIME ZONE 'UTC'
            ) WITH &&
        ) WHERE (room_id IS NOT NULL AND status != 'cancelled')
    """)


def downgrade() -> None:
    op.drop_constraint('class_sessions_room_no_overlap', 'class_sessions', type_='exclude')
    op.drop_constraint('class_sessions_teacher_no_overlap', 'class_sessions', type_='exclude')
    op.drop_constraint('fk_class_sessions_room_id', 'class_sessions', type_='foreignkey')
    op.drop_constraint('fk_class_sessions_teacher_id', 'class_sessions', type_='foreignkey')
    op.drop_column('class_sessions', 'end_time')
    op.drop_column('class_sessions', 'start_time')
    op.drop_column('class_sessions', 'room_id')
    op.drop_column('class_sessions', 'teacher_id')