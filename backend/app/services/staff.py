"""Turning a teacher off, and handing their classes to somebody else.

A teacher who leaves the academy cannot be deleted: their schedules reference
the row, and their past grades and attendance have to survive them. So "baja" is
`is_active = False`. But switching one off while they still hold live classes
would leave those classes with a teacher who cannot log in — so deactivation is
refused until the classes have a new owner, and the refusal names them.

That refusal is the entry point to the bulk reassignment below, which is the
same operation an admin needs anyway when somebody goes on leave mid-term.
"""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    COURSE_IS_ACTIVE,
    Course,
    CourseTeacher,
    Schedule,
    User,
    UserRole,
)
from app.services.scheduling import (
    teacher_conflicts,
    teacher_qualified_for_course,
)


@dataclass
class LiveAssignment:
    """One class still tied to the teacher, in terms the admin can act on."""

    course_id: int
    course_name: str
    schedule_ids: list[int]


def live_assignments(db: Session, teacher_id: int) -> list[LiveAssignment]:
    """Courses the teacher still holds that are open or being taught.

    Draft and closed courses are excluded: a draft has nobody enrolled to strand,
    and a closed one is over. Blocking a baja on either would mean a teacher who
    taught here three years ago can never be switched off.
    """
    rows = db.execute(
        select(Course.id, Course.name, Schedule.id)
        .join(CourseTeacher, CourseTeacher.course_id == Course.id)
        .outerjoin(
            Schedule,
            (Schedule.course_id == Course.id) & (Schedule.teacher_id == teacher_id),
        )
        .where(
            CourseTeacher.teacher_id == teacher_id,
            Course.status.in_(COURSE_IS_ACTIVE),
        )
    ).all()

    grouped: dict[int, LiveAssignment] = {}
    for course_id, course_name, schedule_id in rows:
        entry = grouped.setdefault(
            course_id,
            LiveAssignment(course_id=course_id, course_name=course_name, schedule_ids=[]),
        )
        if schedule_id is not None and schedule_id not in entry.schedule_ids:
            entry.schedule_ids.append(schedule_id)
    return list(grouped.values())


@dataclass
class ReassignOutcome:
    """What happened to one course in a bulk reassignment."""

    course_id: int
    course_name: str
    ok: bool
    schedules_moved: int = 0
    reason: str | None = None


def reassign_teacher(
    db: Session,
    *,
    from_teacher_id: int,
    to_teacher_id: int,
    course_ids: list[int] | None = None,
    force: bool = False,
) -> list[ReassignOutcome]:
    """Hand a teacher's courses — and the slots they teach in them — to another.

    Per-course outcomes rather than all-or-nothing: when six courses move and one
    clashes with the new teacher's Tuesday, an admin wants the five that worked
    and a named reason for the sixth, not a rollback of everything.

    Does not commit; the caller's transaction carries it.
    """
    targets = live_assignments(db, from_teacher_id)
    if course_ids is not None:
        wanted = set(course_ids)
        targets = [t for t in targets if t.course_id in wanted]

    outcomes: list[ReassignOutcome] = []
    for target in targets:
        # The new teacher must be allowed to teach this track. This is a hard
        # rule at assignment time everywhere else in the system, so it is a hard
        # rule here too — `force` does not override it.
        if not teacher_qualified_for_course(db, to_teacher_id, target.course_id):
            outcomes.append(
                ReassignOutcome(
                    course_id=target.course_id,
                    course_name=target.course_name,
                    ok=False,
                    reason="El profesor destino no está cualificado para este idioma",
                )
            )
            continue

        slots = list(
            db.scalars(
                select(Schedule).where(Schedule.id.in_(target.schedule_ids or [-1]))
            ).all()
        )

        clashing = []
        if not force:
            for slot in slots:
                hits = teacher_conflicts(
                    db,
                    teacher_id=to_teacher_id,
                    day_of_week=slot.day_of_week,
                    start_time=slot.start_time,
                    end_time=slot.end_time,
                    term_start=slot.term_start,
                    term_end=slot.term_end,
                    exclude_schedule_id=slot.id,
                )
                if hits:
                    clashing.append(slot)
        if clashing:
            outcomes.append(
                ReassignOutcome(
                    course_id=target.course_id,
                    course_name=target.course_name,
                    ok=False,
                    reason=(
                        "El profesor destino ya tiene otra clase en "
                        + ", ".join(
                            f"{s.start_time.strftime('%H:%M')}–{s.end_time.strftime('%H:%M')}"
                            for s in clashing
                        )
                    ),
                )
            )
            continue

        # Give the destination the right to teach the course before any slot
        # points at them: every schedule's teacher must be assigned first.
        existing = db.scalar(
            select(CourseTeacher).where(
                CourseTeacher.course_id == target.course_id,
                CourseTeacher.teacher_id == to_teacher_id,
            )
        )
        if existing is None:
            db.add(
                CourseTeacher(course_id=target.course_id, teacher_id=to_teacher_id)
            )
            db.flush()

        for slot in slots:
            slot.teacher_id = to_teacher_id

        # Only now can the outgoing assignment go: dropping it earlier would
        # leave the slots pointing at a teacher no longer assigned to the course.
        outgoing = db.scalar(
            select(CourseTeacher).where(
                CourseTeacher.course_id == target.course_id,
                CourseTeacher.teacher_id == from_teacher_id,
            )
        )
        if outgoing is not None:
            db.delete(outgoing)
        db.flush()

        outcomes.append(
            ReassignOutcome(
                course_id=target.course_id,
                course_name=target.course_name,
                ok=True,
                schedules_moved=len(slots),
            )
        )
    return outcomes


def is_teacher(db: Session, user: User | None) -> bool:
    return user is not None and user.role == UserRole.teacher
