"""Creating in-app notifications, and the events that raise them.

`notify()` is the generic outbox writer. The event helpers below are the first
consumers: a cancelled/rescheduled class tells its students, and an at-risk
sweep tells the teachers of the affected courses. New events call `notify()`
the same way, so wiring a reminder or a payment alert later is one function.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    ClassSession,
    CourseTeacher,
    Enrollment,
    EnrollmentStatus,
    Notification,
    Schedule,
)


def notify(
    db: Session,
    recipient_ids: list[int],
    kind: str,
    title: str,
    body: str,
) -> int:
    """Queue one notification per recipient. Returns how many were created.

    Does not commit — it rides the caller's transaction, so a notification never
    outlives the change that raised it.
    """
    for rid in recipient_ids:
        db.add(
            Notification(recipient_id=rid, kind=kind, title=title, body=body)
        )
    return len(recipient_ids)


def _active_student_ids(db: Session, course_id: int) -> list[int]:
    return list(
        db.scalars(
            select(Enrollment.student_id).where(
                Enrollment.course_id == course_id,
                Enrollment.status == EnrollmentStatus.active,
            )
        ).all()
    )


def notify_session_cancelled(
    db: Session, session: ClassSession, rescheduled_to: str | None = None
) -> None:
    """Tell a class's active students it will not be held as planned."""
    course_id = db.scalar(
        select(Schedule.course_id).where(Schedule.id == session.schedule_id)
    )
    if course_id is None:
        return
    students = _active_student_ids(db, course_id)
    if rescheduled_to:
        title = "Clase reprogramada"
        body = f"Tu clase del {session.date.isoformat()} se movió al {rescheduled_to}."
    else:
        title = "Clase cancelada"
        body = f"Tu clase del {session.date.isoformat()} fue cancelada."
    notify(db, students, "session_cancelled", title, body)


def notify_teacher_of_at_risk(
    db: Session, teacher_course_map: dict[int, list[str]]
) -> int:
    """Notify each teacher about the at-risk students in the courses they teach.

    `teacher_course_map` maps course_id → list of student descriptions. Returns
    the number of notifications created.
    """
    created = 0
    for course_id, students in teacher_course_map.items():
        if not students:
            continue
        teacher_ids = list(
            db.scalars(
                select(CourseTeacher.teacher_id).where(
                    CourseTeacher.course_id == course_id
                )
            ).all()
        )
        body = "Alumnos en riesgo: " + "; ".join(students)
        created += notify(
            db, teacher_ids, "at_risk", "Alumnos en riesgo en tu curso", body
        )
    return created


