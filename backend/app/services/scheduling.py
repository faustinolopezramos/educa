"""Reusable scheduling-conflict logic shared by schedules and enrollments.

Schedules are weekly-recurring: a conflict requires the same `day_of_week`
and an overlapping time range. Two ranges overlap when
`start_a < end_b AND end_a > start_b` (touching edges do not overlap).

Schedules also carry a denormalized *term* (`term_start`/`term_end`, copied
from the course). Two weekly blocks only truly clash when their terms overlap
as well, so a Spring course and a Summer course sharing "Mon 10-11" do NOT
conflict. A `None` bound is treated as unbounded (conservative: it overlaps
everything).
"""

from __future__ import annotations

from datetime import date, datetime, time

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    Course,
    Enrollment,
    EnrollmentStatus,
    Level,
    Schedule,
    TeacherAvailability,
    TeacherLanguage,
    User,
)


def _minutes(start: time, end: time) -> int:
    """Whole minutes between two same-day times (end assumed after start)."""
    ref = date(2000, 1, 1)
    return int((datetime.combine(ref, end) - datetime.combine(ref, start)).total_seconds() // 60)


def course_language_id(db: Session, course_id: int) -> int | None:
    """Resolve the language a course belongs to via course → level → language."""
    return db.scalar(
        select(Level.language_id)
        .join(Course, Course.level_id == Level.id)
        .where(Course.id == course_id)
    )


def teacher_qualified_for_course(db: Session, teacher_id: int, course_id: int) -> bool:
    """Whether the teacher may teach the course's language.

    Pragmatic rule: a teacher with *no* configured languages is treated as
    qualified (not yet configured); once at least one is set, the course's
    language must be among them.
    """
    configured = list(
        db.scalars(
            select(TeacherLanguage.language_id).where(
                TeacherLanguage.teacher_id == teacher_id
            )
        ).all()
    )
    if not configured:
        return True
    lang_id = course_language_id(db, course_id)
    return lang_id is None or lang_id in configured


def teacher_available(
    db: Session, teacher_id: int, day_of_week: int, start_time: time, end_time: time
) -> bool:
    """Whether the block fits inside a declared availability window.

    A teacher with no availability windows configured is treated as available.
    """
    windows = list(
        db.scalars(
            select(TeacherAvailability).where(
                TeacherAvailability.teacher_id == teacher_id,
                TeacherAvailability.day_of_week == day_of_week,
            )
        ).all()
    )
    if not windows:
        return True
    return any(w.start_time <= start_time and end_time <= w.end_time for w in windows)


def teacher_weekly_minutes(
    db: Session,
    teacher_id: int,
    term_start: date | None = None,
    term_end: date | None = None,
    exclude_schedule_id: int | None = None,
) -> int:
    """Minutes per week the teacher already teaches during the given term.

    "Weekly hours" is a load in a *given week*, so only classes that actually
    run alongside the term in question count. A Spring course and a Summer
    course never share a week, so they must not add up against the cap.
    """
    stmt = select(Schedule).where(Schedule.teacher_id == teacher_id)
    if exclude_schedule_id is not None:
        stmt = stmt.where(Schedule.id != exclude_schedule_id)
    return sum(
        _minutes(s.start_time, s.end_time)
        for s in db.scalars(stmt).all()
        if terms_overlap(term_start, term_end, s.term_start, s.term_end)
    )


def teacher_exceeds_load(
    db: Session,
    teacher_id: int,
    start_time: time,
    end_time: time,
    term_start: date | None = None,
    term_end: date | None = None,
    exclude_schedule_id: int | None = None,
) -> bool:
    """Whether adding this block would push the teacher past max_weekly_hours."""
    teacher = db.get(User, teacher_id)
    if teacher is None or teacher.max_weekly_hours is None:
        return False
    projected = (
        teacher_weekly_minutes(db, teacher_id, term_start, term_end, exclude_schedule_id)
        + _minutes(start_time, end_time)
    )
    return projected > teacher.max_weekly_hours * 60


def terms_overlap(
    start_a: date | None,
    end_a: date | None,
    start_b: date | None,
    end_b: date | None,
) -> bool:
    """True if two closed date ranges overlap; `None` means unbounded."""
    if start_a is not None and end_b is not None and start_a > end_b:
        return False
    if start_b is not None and end_a is not None and start_b > end_a:
        return False
    return True


def intervals_overlap(
    day_a: int,
    start_a: time,
    end_a: time,
    day_b: int,
    start_b: time,
    end_b: time,
    term_a: tuple[date | None, date | None] | None = None,
    term_b: tuple[date | None, date | None] | None = None,
) -> bool:
    """True if two weekly time blocks fall on the same day, overlap in time,
    and (when terms are given) their terms overlap too."""
    if day_a != day_b:
        return False
    if not (start_a < end_b and end_a > start_b):
        return False
    if term_a is not None and term_b is not None:
        return terms_overlap(term_a[0], term_a[1], term_b[0], term_b[1])
    return True


def teacher_conflicts(
    db: Session,
    teacher_id: int,
    day_of_week: int,
    start_time: time,
    end_time: time,
    term_start: date | None = None,
    term_end: date | None = None,
    exclude_schedule_id: int | None = None,
) -> list[Schedule]:
    """Schedules of `teacher_id` that clash with the given day/time/term block."""
    stmt = select(Schedule).where(
        Schedule.teacher_id == teacher_id,
        Schedule.day_of_week == day_of_week,
    )
    if exclude_schedule_id is not None:
        stmt = stmt.where(Schedule.id != exclude_schedule_id)
    return [
        s
        for s in db.scalars(stmt).all()
        if intervals_overlap(
            day_of_week,
            start_time,
            end_time,
            s.day_of_week,
            s.start_time,
            s.end_time,
            (term_start, term_end),
            (s.term_start, s.term_end),
        )
    ]


def room_conflicts(
    db: Session,
    room_id: int,
    day_of_week: int,
    start_time: time,
    end_time: time,
    term_start: date | None = None,
    term_end: date | None = None,
    exclude_schedule_id: int | None = None,
) -> list[Schedule]:
    """Schedules in `room_id` that clash with the given day/time/term block."""
    stmt = select(Schedule).where(
        Schedule.room_id == room_id,
        Schedule.day_of_week == day_of_week,
    )
    if exclude_schedule_id is not None:
        stmt = stmt.where(Schedule.id != exclude_schedule_id)
    return [
        s
        for s in db.scalars(stmt).all()
        if intervals_overlap(
            day_of_week,
            start_time,
            end_time,
            s.day_of_week,
            s.start_time,
            s.end_time,
            (term_start, term_end),
            (s.term_start, s.term_end),
        )
    ]


def student_schedule_conflicts(
    db: Session, student_id: int, course_id: int
) -> list[Schedule]:
    """Schedules of the student's active courses that clash with `course_id`.

    Compares every schedule of the target course against every schedule of the
    courses where the student already has an *active* enrollment, taking the
    course term into account (a finished course cannot clash with a new one).
    """
    target = list(
        db.scalars(select(Schedule).where(Schedule.course_id == course_id)).all()
    )
    if not target:
        return []

    existing_course_ids = list(
        db.scalars(
            select(Enrollment.course_id).where(
                Enrollment.student_id == student_id,
                Enrollment.status == EnrollmentStatus.active,
                Enrollment.course_id != course_id,
            )
        ).all()
    )
    if not existing_course_ids:
        return []

    existing = list(
        db.scalars(
            select(Schedule).where(Schedule.course_id.in_(existing_course_ids))
        ).all()
    )

    clashing: list[Schedule] = []
    for t in target:
        for e in existing:
            if intervals_overlap(
                t.day_of_week,
                t.start_time,
                t.end_time,
                e.day_of_week,
                e.start_time,
                e.end_time,
                (t.term_start, t.term_end),
                (e.term_start, e.term_end),
            ):
                clashing.append(e)
    return clashing
