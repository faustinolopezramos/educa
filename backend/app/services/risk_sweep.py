"""The weekly at-risk sweep: the alert nobody has to remember to send.

The rule itself lives in `app.services.reports` (low attendance, low average
including exams, weak skills, consecutive absences). This module only decides
*when* it runs and *who* hears about it: once a week per academy, over the last
four weeks, telling each course's teachers who is slipping in their course and
the academy's admins and assistants the whole list.

Runs from the API's background loop (`app.services.delivery.DispatchLoop`) and
from `python -m app.cli at-risk-sweep`.
"""

from __future__ import annotations

import logging
from datetime import date, datetime, time, timedelta

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.clock import academy_now, academy_tz
from app.core.config import settings
from app.models import (
    COURSE_IS_ACTIVE,
    AtRiskSweep,
    AuditLog,
    Course,
    Tenant,
    User,
    UserRole,
)
from app.services.notifications import (
    notify_directors_of_at_risk,
    notify_teacher_of_at_risk,
)
from app.services.reports import build_report

logger = logging.getLogger(__name__)


def week_start(d: date) -> date:
    return d - timedelta(days=d.weekday())


def sweep_due_at(today: date) -> datetime:
    """The moment this week's sweep becomes due, in the academy's zone."""
    day = week_start(today) + timedelta(days=settings.at_risk_sweep_weekday)
    return datetime.combine(day, time(settings.at_risk_sweep_hour), tzinfo=academy_tz())


def _running_courses_by_academy(db: Session) -> dict[int | None, list[int]]:
    """Courses being taught, grouped by academy. Suspended academies are left out."""
    rows = db.execute(
        select(Course.tenant_id, Course.id)
        .outerjoin(Tenant, Tenant.id == Course.tenant_id)
        .where(
            Course.status.in_(COURSE_IS_ACTIVE),
            (Course.tenant_id.is_(None)) | (Tenant.is_active.is_(True)),
        )
    ).all()
    groups: dict[int | None, list[int]] = {}
    for tenant_id, course_id in rows:
        groups.setdefault(tenant_id, []).append(course_id)
    return groups


def sweep_academy(
    db: Session, tenant_id: int | None, course_ids: list[int], today: date
) -> AtRiskSweep | None:
    """Run this week's sweep for one academy. None if it already ran.

    Does not commit: the claim, the notifications and the audit row land
    together or not at all, so a sweep that fails halfway is retried whole.
    """
    sweep = AtRiskSweep(tenant_id=tenant_id, week_start=week_start(today))
    try:
        with db.begin_nested():
            db.add(sweep)
            db.flush()
    except IntegrityError:
        return None

    # Un actor de sistema, nunca guardado: sólo sirve para que el reporte se
    # acote a esta academia. `only_course_ids` lo acota además a sus cursos en
    # marcha — sin academia (`tenant_id` NULL), el alcance de admin sería el de
    # toda la instalación.
    system = User(role=UserRole.admin, tenant_id=tenant_id, full_name="Sistema", email="")
    report = build_report(db, system, "last4w", today, only_course_ids=course_ids)

    by_course: dict[int, list[str]] = {}
    lines: list[str] = []
    for r in report.at_risk:
        reasons = ", ".join(r.reasons)
        by_course.setdefault(r.course_id, []).append(f"{r.student_name} ({reasons})")
        lines.append(f"{r.student_name} — {r.course_name} ({reasons})")

    created = notify_teacher_of_at_risk(db, by_course)
    created += notify_directors_of_at_risk(
        db, tenant_id, len(report.at_risk), len(by_course), details=lines
    )
    sweep.students_flagged = len({r.student_id for r in report.at_risk})
    sweep.notifications_sent = created
    db.add(
        AuditLog(
            tenant_id=tenant_id,
            actor_id=None,
            action="create",
            entity="at_risk_alert_sweep",
            entity_id=sweep.id,
            after={
                "automatic": True,
                "week_start": str(sweep.week_start),
                "students_flagged": sweep.students_flagged,
                "alerts_sent": created,
            },
        )
    )
    return sweep


def run_due_sweeps(db: Session, now: datetime | None = None, force: bool = False) -> int:
    """Sweep every academy whose sweep for this week is due and not yet done.

    Returns how many academies were swept. Commits after each academy, so one
    failing does not hold back the rest. `force` ignores the day and hour (the
    once-per-week guarantee still holds).
    """
    if not settings.at_risk_sweep_enabled and not force:
        return 0
    now = now or academy_now()
    today = now.date()
    if not force and now < sweep_due_at(today):
        return 0

    done = 0
    for tenant_id, course_ids in _running_courses_by_academy(db).items():
        try:
            sweep = sweep_academy(db, tenant_id, course_ids, today)
            db.commit()
        except Exception:
            db.rollback()
            logger.exception("Falló el barrido de riesgo de la academia %s", tenant_id)
            continue
        if sweep is not None:
            done += 1
            logger.info(
                "Barrido de riesgo academia %s: %s alumno(s), %s aviso(s)",
                tenant_id, sweep.students_flagged, sweep.notifications_sent,
            )
    return done
