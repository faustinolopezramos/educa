"""What a course must satisfy before it may move to the next state.

The transition table (`COURSE_TRANSITIONS`) says which moves exist; this module
says which ones are *earned*. They are different questions: "draft → open" is a
legal move, but only for a course that actually has a timetable and somebody to
teach it. Opening enrolment on a course with neither is how students end up
seated in something that cannot be delivered.

Every guard returns the reason it refused, so the API can hand the admin the
list of what to fix rather than a bare "no".
"""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    COURSE_STATUS_LABELS,
    Course,
    CourseStatus,
    CourseTeacher,
    Schedule,
    course_transition_allowed,
)
from app.services.enrollments import seats_taken


@dataclass
class TransitionRefusal:
    """Why a course may not move, in terms the admin can act on."""

    reason: str
    message: str
    #: What is missing or in the way, so the UI can link straight to it.
    blockers: list[str]


def _requirements_to_open(db: Session, course: Course) -> list[str]:
    """What a course still lacks before students may be seated in it."""
    missing: list[str] = []
    if course.start_date is None or course.end_date is None:
        missing.append("Fechas de inicio y fin")
    has_teacher = db.scalar(
        select(CourseTeacher.id).where(CourseTeacher.course_id == course.id)
    )
    if has_teacher is None:
        missing.append("Al menos un profesor asignado")
    has_schedule = db.scalar(
        select(Schedule.id).where(Schedule.course_id == course.id)
    )
    if has_schedule is None:
        missing.append("Al menos un horario")
    return missing


def check_transition(
    db: Session, course: Course, target: CourseStatus
) -> TransitionRefusal | None:
    """`None` when the move is allowed, otherwise why it is not."""
    current = course.status

    if not course_transition_allowed(current, target):
        return TransitionRefusal(
            reason="illegal_transition",
            message=(
                f"No se puede pasar de «{COURSE_STATUS_LABELS[current]}» a "
                f"«{COURSE_STATUS_LABELS[target]}»"
            ),
            blockers=[],
        )

    if current == target:
        return None

    # --- Opening for enrolment ---
    if target == CourseStatus.open:
        missing = _requirements_to_open(db, course)
        if missing:
            return TransitionRefusal(
                reason="not_ready_to_open",
                message=(
                    "Faltan datos para abrir la matrícula de este curso. "
                    "Un alumno no puede quedar inscrito en algo que todavía no "
                    "se puede impartir."
                ),
                blockers=missing,
            )

    # --- Back to the drawing board ---
    if target == CourseStatus.draft:
        taken = seats_taken(db, course.id)
        if taken:
            return TransitionRefusal(
                reason="has_enrollments",
                message=(
                    f"El curso ya tiene {taken} alumno(s) matriculado(s). "
                    "Devolverlo a borrador lo sacaría de la vista de esos alumnos "
                    "sin darles de baja."
                ),
                blockers=[f"{taken} matrícula(s) activa(s)"],
            )

    # --- Shelving it ---
    if target == CourseStatus.archived:
        taken = seats_taken(db, course.id)
        if taken:
            return TransitionRefusal(
                reason="has_enrollments",
                message=(
                    f"El curso todavía tiene {taken} alumno(s) matriculado(s). "
                    "Ciérralo y resuelve sus matrículas antes de archivarlo."
                ),
                blockers=[f"{taken} matrícula(s) activa(s)"],
            )

    return None


def attach_course_stats(db: Session, courses) -> list:
    """Fill `seats_taken`, `teacher_count` and `schedule_count` on each course.

    Three grouped queries for the whole list, not three per row. The course
    panel needs all three to render a single card — how full it is, whether it
    has anybody to teach it, whether it has a timetable — and it used to fetch
    every enrolment and schedule in the academy to work them out client-side.
    """
    from app.models import ENROLLMENT_OCCUPIES_SEAT, Enrollment

    rows = list(courses)
    if not rows:
        return rows
    ids = [c.id for c in rows]

    seats = dict(
        db.execute(
            select(Enrollment.course_id, func.count())
            .where(
                Enrollment.course_id.in_(ids),
                Enrollment.status.in_(ENROLLMENT_OCCUPIES_SEAT),
            )
            .group_by(Enrollment.course_id)
        ).all()
    )
    teachers = dict(
        db.execute(
            select(CourseTeacher.course_id, func.count())
            .where(CourseTeacher.course_id.in_(ids))
            .group_by(CourseTeacher.course_id)
        ).all()
    )
    slots = dict(
        db.execute(
            select(Schedule.course_id, func.count())
            .where(Schedule.course_id.in_(ids))
            .group_by(Schedule.course_id)
        ).all()
    )
    for course in rows:
        course.seats_taken = seats.get(course.id, 0)
        course.teacher_count = teachers.get(course.id, 0)
        course.schedule_count = slots.get(course.id, 0)
    return rows


def occupancy(db: Session, course: Course) -> tuple[int, int]:
    """`(seats taken, seats offered)` for one course."""
    return seats_taken(db, course.id), course.max_students


def academy_occupancy(db: Session, course_ids: list[int]) -> tuple[int, int]:
    """`(seats taken, seats offered)` across the academy's *active* courses.

    Draft and archived courses are excluded on purpose: an occupancy rate that
    counted seats nobody can sit in would read low for a full academy simply
    because somebody left a draft lying around.
    """
    if not course_ids:
        return 0, 0
    from app.models import COURSE_IS_ACTIVE, Enrollment, ENROLLMENT_OCCUPIES_SEAT

    active = list(
        db.scalars(
            select(Course).where(
                Course.id.in_(course_ids), Course.status.in_(COURSE_IS_ACTIVE)
            )
        ).all()
    )
    if not active:
        return 0, 0
    offered = sum(c.max_students for c in active)
    taken = (
        db.scalar(
            select(func.count())
            .select_from(Enrollment)
            .where(
                Enrollment.course_id.in_([c.id for c in active]),
                Enrollment.status.in_(ENROLLMENT_OCCUPIES_SEAT),
            )
        )
        or 0
    )
    return taken, offered
