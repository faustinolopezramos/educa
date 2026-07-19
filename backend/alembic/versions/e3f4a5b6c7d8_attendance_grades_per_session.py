"""attendance and grades keyed by class session

Revision ID: e3f4a5b6c7d8
Revises: d2e3f4a5b6c7
Create Date: 2026-07-16 11:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "e3f4a5b6c7d8"
down_revision: Union[str, None] = "d2e3f4a5b6c7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _backfill_attendance(conn) -> None:
    """Point each existing attendance row at a class session.

    Legacy rows carry a bare date. We place each one on a session of a schedule
    of the student's course — preferring the schedule whose weekday matches the
    date — creating the session if it does not exist yet. A row whose course has
    no schedule at all cannot be placed and is dropped (it could never have been
    a real class).
    """
    rows = conn.execute(
        sa.text(
            "SELECT a.id, a.date, e.course_id "
            "FROM attendance a JOIN enrollments e ON e.id = a.enrollment_id"
        )
    ).fetchall()
    for att_id, att_date, course_id in rows:
        weekday = att_date.weekday()
        sched = conn.execute(
            sa.text(
                "SELECT id FROM schedules "
                "WHERE course_id = :c AND day_of_week = :w LIMIT 1"
            ),
            {"c": course_id, "w": weekday},
        ).fetchone()
        if sched is None:
            sched = conn.execute(
                sa.text("SELECT id FROM schedules WHERE course_id = :c LIMIT 1"),
                {"c": course_id},
            ).fetchone()
        if sched is None:
            conn.execute(
                sa.text("DELETE FROM attendance WHERE id = :i"), {"i": att_id}
            )
            continue
        schedule_id = sched[0]
        sess = conn.execute(
            sa.text(
                "SELECT id FROM class_sessions "
                "WHERE schedule_id = :s AND date = :d"
            ),
            {"s": schedule_id, "d": att_date},
        ).fetchone()
        if sess is None:
            sess_id = conn.execute(
                sa.text(
                    "INSERT INTO class_sessions (schedule_id, date, status) "
                    "VALUES (:s, :d, 'scheduled') RETURNING id"
                ),
                {"s": schedule_id, "d": att_date},
            ).fetchone()[0]
        else:
            sess_id = sess[0]
        conn.execute(
            sa.text("UPDATE attendance SET session_id = :s WHERE id = :i"),
            {"s": sess_id, "i": att_id},
        )


def upgrade() -> None:
    conn = op.get_bind()

    # --- attendance: date -> session_id ---
    op.add_column("attendance", sa.Column("session_id", sa.Integer(), nullable=True))
    _backfill_attendance(conn)
    op.alter_column("attendance", "session_id", nullable=False)
    op.drop_constraint(
        "uq_attendance_enrollment_date", "attendance", type_="unique"
    )
    op.create_foreign_key(
        "fk_attendance_session_id",
        "attendance",
        "class_sessions",
        ["session_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index(
        op.f("ix_attendance_session_id"), "attendance", ["session_id"]
    )
    op.create_unique_constraint(
        "uq_attendance_enrollment_session", "attendance", ["enrollment_id", "session_id"]
    )
    op.drop_column("attendance", "date")

    # --- grades: add nullable session_id + partial uniqueness ---
    op.add_column("grades", sa.Column("session_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_grades_session_id",
        "grades",
        "class_sessions",
        ["session_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index(op.f("ix_grades_session_id"), "grades", ["session_id"])
    op.drop_constraint("uq_grade_enrollment_evaluation", "grades", type_="unique")
    # One score per evaluation per session, and one per evaluation at course level.
    op.create_index(
        "uq_grade_session",
        "grades",
        ["enrollment_id", "session_id", "evaluation_name"],
        unique=True,
        postgresql_where=sa.text("session_id IS NOT NULL"),
    )
    op.create_index(
        "uq_grade_course",
        "grades",
        ["enrollment_id", "evaluation_name"],
        unique=True,
        postgresql_where=sa.text("session_id IS NULL"),
    )


def downgrade() -> None:
    # grades
    op.drop_index("uq_grade_course", table_name="grades")
    op.drop_index("uq_grade_session", table_name="grades")
    op.create_unique_constraint(
        "uq_grade_enrollment_evaluation", "grades", ["enrollment_id", "evaluation_name"]
    )
    op.drop_index(op.f("ix_grades_session_id"), table_name="grades")
    op.drop_constraint("fk_grades_session_id", "grades", type_="foreignkey")
    op.drop_column("grades", "session_id")

    # attendance
    op.add_column("attendance", sa.Column("date", sa.Date(), nullable=True))
    op.execute(
        "UPDATE attendance a SET date = s.date "
        "FROM class_sessions s WHERE a.session_id = s.id"
    )
    op.alter_column("attendance", "date", nullable=False)
    op.drop_constraint(
        "uq_attendance_enrollment_session", "attendance", type_="unique"
    )
    op.drop_index(op.f("ix_attendance_session_id"), table_name="attendance")
    op.drop_constraint("fk_attendance_session_id", "attendance", type_="foreignkey")
    op.drop_column("attendance", "session_id")
    op.create_unique_constraint(
        "uq_attendance_enrollment_date", "attendance", ["enrollment_id", "date"]
    )
