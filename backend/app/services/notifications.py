"""Creating notifications, and the events that raise them.

`notify()` is the generic outbox writer: one in-app row per recipient, plus one
`NotificationDelivery` per external channel that recipient can be reached on
(email, WhatsApp). Everything rides the caller's transaction, so a message is
sent if and only if the change that raised it is committed; the dispatcher in
`app.services.delivery` does the sending afterwards.

The event helpers below are the consumers: a cancelled/rescheduled class tells
its students, and an at-risk sweep tells the teachers of the affected courses.
"""

from __future__ import annotations

from collections.abc import Callable
from datetime import date, time

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    ENROLLMENT_HAS_ACCESS,
    ClassSession,
    Course,
    CourseTeacher,
    DeliveryChannel,
    Enrollment,
    Notification,
    NotificationDelivery,
    Schedule,
    User,
    UserRole,
)
from app.services.email import email_configured
from app.services.whatsapp import normalize_phone, whatsapp_configured

_DIAS = ("lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo")
_MESES = (
    "enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
    "agosto", "septiembre", "octubre", "noviembre", "diciembre",
)


def fecha_larga(d: date) -> str:
    """"lunes 15 de septiembre": how a date reads in a message, not an ISO key."""
    return f"{_DIAS[d.weekday()]} {d.day} de {_MESES[d.month - 1]}"


def _first_name(user: User) -> str:
    return (user.full_name or "").split()[0] if user.full_name else ""


def _class_when(data: dict) -> str:
    when = fecha_larga(date.fromisoformat(data["date"]))
    return f"{when} a las {data['start_time']}" if data.get("start_time") else when


def _session_cancelled_template(user: User, data: dict) -> tuple[str, list[str]]:
    if data.get("rescheduled_to"):
        return "educa_clase_reprogramada", [
            _first_name(user),
            data["course"],
            _class_when(data),
            fecha_larga(date.fromisoformat(data["rescheduled_to"])),
        ]
    return "educa_clase_cancelada", [_first_name(user), data["course"], _class_when(data)]


# Tipo de notificación → plantilla de WhatsApp y sus parámetros. Un tipo que no
# está aquí no sale por WhatsApp: Meta no admite texto libre en un mensaje que
# inicia la academia, y cada plantilla hay que registrarla y esperar su
# aprobación (DEPLOYMENT.md las lista con su texto exacto).
WHATSAPP_TEMPLATES: dict[str, Callable[[User, dict], tuple[str, list[str]]]] = {
    "session_cancelled": _session_cancelled_template,
}


def notify(
    db: Session,
    recipient_ids: list[int],
    kind: str,
    title: str,
    body: str,
    data: dict | None = None,
) -> int:
    """Queue one notification per recipient. Returns how many were created.

    Does not commit — it rides the caller's transaction, so a notification never
    outlives the change that raised it. External deliveries are queued only for
    channels that are configured, that the recipient has not turned off, and
    that have somewhere to go (an address, a phone that parses).
    """
    if not recipient_ids:
        return 0
    users = {
        u.id: u for u in db.scalars(select(User).where(User.id.in_(recipient_ids))).all()
    }
    send_email = email_configured()
    send_whatsapp = whatsapp_configured() and kind in WHATSAPP_TEMPLATES and data is not None
    for rid in recipient_ids:
        note = Notification(recipient_id=rid, kind=kind, title=title, body=body, data=data)
        user = users.get(rid)
        if user is not None and user.is_active:
            if send_email and user.notify_email and user.email:
                note.deliveries.append(
                    NotificationDelivery(channel=DeliveryChannel.email, destination=user.email)
                )
            phone = normalize_phone(user.phone) if send_whatsapp and user.notify_whatsapp else None
            if phone:
                note.deliveries.append(
                    NotificationDelivery(channel=DeliveryChannel.whatsapp, destination=phone)
                )
        db.add(note)
    return len(recipient_ids)


def _reachable_student_ids(db: Session, course_id: int) -> list[int]:
    """Students of a course who still have a class to be told about.

    Anyone expecting to show up needs the warning, which is the same population
    the lobby lets in — not the narrower "already activated" set that used to be
    used here, and which quietly left every "Inscrito" student unwarned.
    """
    return list(
        db.scalars(
            select(Enrollment.student_id).where(
                Enrollment.course_id == course_id,
                Enrollment.status.in_(ENROLLMENT_HAS_ACCESS),
            )
        ).all()
    )


def notify_session_cancelled(
    db: Session, session: ClassSession, rescheduled_to: str | None = None
) -> None:
    """Tell a class's students it will not be held as planned."""
    row = db.execute(
        select(Schedule.course_id, Course.name)
        .join(Course, Course.id == Schedule.course_id)
        .where(Schedule.id == session.schedule_id)
    ).first()
    if row is None:
        return
    course_id, course_name = row
    students = _reachable_student_ids(db, course_id)
    start: time | None = session.start_time
    data = {
        "course": course_name,
        "date": session.date.isoformat(),
        "start_time": start.strftime("%H:%M") if start else None,
        "rescheduled_to": rescheduled_to,
    }
    when = _class_when(data)
    if rescheduled_to:
        title = "Clase reprogramada"
        body = (
            f"Tu clase de {course_name} del {when} se movió al "
            f"{fecha_larga(date.fromisoformat(rescheduled_to))}."
        )
    else:
        title = "Clase cancelada"
        body = f"Tu clase de {course_name} del {when} fue cancelada."
    notify(db, students, "session_cancelled", title, body, data=data)


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


def notify_directors_of_at_risk(
    db: Session, tenant_id: int | None, total_students: int, affected_courses_count: int
) -> int:
    """Notify the academy's admins and assistants about its at-risk count.

    Scoped to one academy: the recipients used to be every admin of every
    tenant, which in the bell was a quiet leak and by email would be a loud one.
    """
    if total_students == 0:
        return 0
    directors = list(
        db.scalars(
            select(User.id).where(
                User.role.in_([UserRole.admin, UserRole.assistant]),
                User.tenant_id == tenant_id if tenant_id is not None else User.tenant_id.is_(None),
                User.is_active.is_(True),
            )
        ).all()
    )
    if not directors:
        return 0
    title = "Alerta Académica: Alumnos en riesgo detectados"
    body = f"Se han detectado {total_students} alumno(s) en riesgo académico en {affected_courses_count} curso(s)."
    return notify(db, directors, "at_risk_management", title, body)
