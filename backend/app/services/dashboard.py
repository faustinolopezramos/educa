"""What each role needs to act on, computed once per role.

Every home screen used to answer "how many?" — students, classes, attendance
rate — and none of them answered "what needs me?". The counts were true and
inert: an admin could read them all and still not know that five matrículas had
fallen into arrears, that eight classes last week were never registered, or that
a course was one seat from full.

This module produces the short list of things that are waiting on the caller.
Each item carries the section it resolves in, so the UI links straight there
instead of describing a problem and leaving the user to find it.

Nothing here is new state: it is the same rows the panels already read, asked a
different question.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session as DbSession

from app.core.clock import academy_today
from app.core.deps import (
    apply_tenant,
    has_user_permission,
    is_admin,
    student_course_ids,
    teacher_course_ids,
    tenant_course_ids,
)
from app.models import (
    COURSE_IS_ACTIVE,
    ENROLLMENT_HAS_ACCESS,
    ENROLLMENT_OCCUPIES_SEAT,
    CourseStatus,
    Assignment,
    AssignmentSubmission,
    ClassSession,
    Course,
    Enrollment,
    LocationProposal,
    PaymentStatus,
    Permission,
    ProposalStatus,
    Schedule,
    SessionStatus,
    User,
    UserRole,
)
from app.services.courses import academy_occupancy
from app.services.enrollments import balances_for, seats_taken

# A course this close to `max_students` is worth flagging before it fills.
NEARLY_FULL_FREE_SEATS = 2


@dataclass
class ActionItem:
    """One thing waiting on the caller.

    `section` is the `?m=` the UI navigates to, so an item is never a dead end.
    `severity` orders the tray: `critical` is money or a blocked class,
    `warning` is something slipping, `info` is worth knowing.
    """

    kind: str
    label: str
    count: int
    severity: str
    section: str
    detail: str | None = None
    amount: float | None = None


@dataclass
class AcademyKpis:
    """The three numbers that describe an academy's operating state.

    Occupancy counts only *active* courses: a rate that included drafts and
    archives would read low for a full academy simply because somebody left a
    draft lying around.
    """

    active_courses: int = 0
    draft_courses: int = 0
    total_courses: int = 0
    active_students: int = 0
    active_teachers: int = 0
    seats_taken: int = 0
    seats_offered: int = 0
    #: `seats_taken / seats_offered`, or None when nothing is being offered —
    #: which is not the same as 0% and must not render as one.
    occupancy_rate: float | None = None


@dataclass
class DashboardSummary:
    role: str
    items: list[ActionItem] = field(default_factory=list)
    # Student-only context, so the home screen does not need three more calls.
    balance_due: float = 0.0
    next_session_id: int | None = None
    # Staff-only. `None` for anyone else rather than a block of zeros, which
    # would read as "an academy with nothing in it".
    kpis: AcademyKpis | None = None


def _academy_kpis(db: DbSession, user: User, course_ids: list[int]) -> AcademyKpis:
    kpis = AcademyKpis(total_courses=len(course_ids))
    if not course_ids:
        return kpis

    by_status = dict(
        db.execute(
            select(Course.status, func.count())
            .where(Course.id.in_(course_ids))
            .group_by(Course.status)
        ).all()
    )
    kpis.active_courses = sum(by_status.get(s, 0) for s in COURSE_IS_ACTIVE)
    kpis.draft_courses = by_status.get(CourseStatus.draft, 0)

    # Distinct students, not enrolments: somebody taking two courses is one
    # student on the roll, and counting them twice inflates the headline number
    # every time the academy cross-sells.
    kpis.active_students = (
        db.scalar(
            select(func.count(func.distinct(Enrollment.student_id))).where(
                Enrollment.course_id.in_(course_ids),
                Enrollment.status.in_(ENROLLMENT_OCCUPIES_SEAT),
            )
        )
        or 0
    )
    kpis.active_teachers = (
        db.scalar(
            apply_tenant(
                select(func.count(User.id)).where(
                    User.role == UserRole.teacher, User.is_active.is_(True)
                ),
                User.tenant_id,
                user,
            )
        )
        or 0
    )

    taken, offered = academy_occupancy(db, course_ids)
    kpis.seats_taken = taken
    kpis.seats_offered = offered
    kpis.occupancy_rate = round(taken / offered, 4) if offered else None
    return kpis


def _past_unregistered(db: DbSession, course_ids: list[int], since: date) -> int:
    """Classes whose date has passed but whose register was never taken.

    `held` is written when a teacher marks attendance, so a past session still
    sitting at `scheduled` is one nobody filed — the gap the reports now show as
    "sin registrar" and which used to be silently counted as taught.
    """
    if not course_ids:
        return 0
    return (
        db.scalar(
            select(func.count())
            .select_from(ClassSession)
            .join(Schedule, ClassSession.schedule_id == Schedule.id)
            .where(
                Schedule.course_id.in_(course_ids),
                ClassSession.date < academy_today(),
                ClassSession.date >= since,
                ClassSession.status == SessionStatus.scheduled,
            )
        )
        or 0
    )


def _staff_items(db: DbSession, user: User, course_ids: list[int]) -> list[ActionItem]:
    items: list[ActionItem] = []

    # --- Location proposals waiting on a decision ---
    if has_user_permission(user, Permission.manage_schedules):
        pending = (
            db.scalar(
                select(func.count())
                .select_from(LocationProposal)
                .join(Schedule, LocationProposal.schedule_id == Schedule.id)
                .where(
                    Schedule.course_id.in_(course_ids or [-1]),
                    LocationProposal.status == ProposalStatus.pending,
                )
            )
            or 0
        )
        if pending:
            items.append(
                ActionItem(
                    kind="pending_proposals",
                    label="propuesta de ubicación sin revisar"
                    if pending == 1
                    else "propuestas de ubicación sin revisar",
                    count=pending,
                    severity="warning",
                    section="pendientes",
                    detail="Un profesor espera que apruebes dónde dará su clase.",
                )
            )

    # --- Money past its due date ---
    if has_user_permission(user, Permission.manage_finance):
        delinquent = list(
            db.scalars(
                select(Enrollment).where(
                    Enrollment.course_id.in_(course_ids or [-1]),
                    Enrollment.status.in_(ENROLLMENT_OCCUPIES_SEAT),
                    Enrollment.payment_status == PaymentStatus.overdue,
                )
            ).all()
        )
        if delinquent:
            owed = sum(
                max(0.0, v)
                for v in balances_for(db, [e.id for e in delinquent]).values()
            )
            items.append(
                ActionItem(
                    kind="overdue_enrollments",
                    label="matrícula en mora" if len(delinquent) == 1 else "matrículas en mora",
                    count=len(delinquent),
                    severity="critical",
                    section="enrollments",
                    detail="Un alumno en mora no puede ver sus notas ni su reporte.",
                    amount=round(owed, 2),
                )
            )

    # Classes with no register are deliberately *not* raised here.
    #
    # They were, and it was a bad item: taking a register is a teacher's action
    # on one concrete session, so an admin got told about a problem and sent to
    # the course list, where there is nothing they can do about it. The item did
    # not name the teacher or the course either, so even the one real action —
    # chasing whoever did not file — had nothing to go on. And it justified
    # itself with "no cuentan como realizadas en los reportes", which is an
    # accounting detail of this system rather than a consequence anybody cares
    # about.
    #
    # The teacher's own tray raises it (see `_teacher_items`), where it is their
    # pending work and one click from the class it belongs to. Supervising who
    # is behind on registers is a real need, but it is a screen of its own —
    # by teacher, with a way to nudge — not a number in a tray.

    # --- Courses about to fill up ---
    if has_user_permission(user, Permission.manage_enrollments):
        nearly_full = 0
        for course in db.scalars(
            select(Course).where(Course.id.in_(course_ids or [-1]))
        ).all():
            free = course.max_students - seats_taken(db, course.id)
            if 0 <= free <= NEARLY_FULL_FREE_SEATS:
                nearly_full += 1
        if nearly_full:
            items.append(
                ActionItem(
                    kind="courses_nearly_full",
                    label="curso a punto de llenarse"
                    if nearly_full == 1
                    else "cursos a punto de llenarse",
                    count=nearly_full,
                    severity="info",
                    section="courses",
                    detail=f"Les quedan {NEARLY_FULL_FREE_SEATS} plazas o menos.",
                )
            )

    return items


def _teacher_items(db: DbSession, user: User, course_ids: list[int]) -> list[ActionItem]:
    items: list[ActionItem] = []
    unregistered = _past_unregistered(
        db, course_ids, academy_today() - timedelta(days=30)
    )
    if unregistered:
        items.append(
            ActionItem(
                kind="unregistered_sessions",
                label="clase sin pasar lista" if unregistered == 1 else "clases sin pasar lista",
                count=unregistered,
                severity="warning",
                section="clases",
                # The consequence that matters to a teacher is their students',
                # not the report's: an unfiled register leaves everyone in that
                # class with a hole in their attendance, which is what the
                # at-risk sweep and their progress screen read.
                detail=(
                    "Tus alumnos quedan sin asistencia registrada en esas clases."
                ),
            )
        )

    # A proposal of the teacher's own that has not been answered yet: they are
    # waiting on somebody, which is worth saying rather than leaving them to
    # wonder whether they submitted it at all.
    awaiting = (
        db.scalar(
            select(func.count())
            .select_from(LocationProposal)
            .where(
                LocationProposal.proposed_by == user.id,
                LocationProposal.status == ProposalStatus.pending,
            )
        )
        or 0
    )
    if awaiting:
        items.append(
            ActionItem(
                kind="awaiting_approval",
                label="propuesta tuya esperando aprobación"
                if awaiting == 1
                else "propuestas tuyas esperando aprobación",
                count=awaiting,
                severity="info",
                section="clases",
                detail="Dirección todavía no ha revisado dónde darás la clase.",
            )
        )
    return items


def _student_items(
    db: DbSession, user: User, course_ids: list[int]
) -> tuple[list[ActionItem], float]:
    items: list[ActionItem] = []

    live = list(
        db.scalars(
            select(Enrollment).where(
                Enrollment.student_id == user.id,
                Enrollment.status.in_(ENROLLMENT_HAS_ACCESS),
            )
        ).all()
    )
    balances = balances_for(db, [e.id for e in live])
    balance_due = round(sum(max(0.0, balances.get(e.id, e.amount or 0.0)) for e in live), 2)

    overdue = [e for e in live if e.payment_status == PaymentStatus.overdue]
    if overdue:
        items.append(
            ActionItem(
                kind="payment_overdue",
                label="cuota vencida" if len(overdue) == 1 else "cuotas vencidas",
                count=len(overdue),
                severity="critical",
                # Home, not the profile: a student cannot settle a fee inside
                # the app, so pointing them at a screen with no way to act
                # would be a dead end dressed as a next step. The detail says
                # what actually resolves it.
                section="inicio",
                detail=(
                    "Acércate a administración para regularizarla. Mientras siga "
                    "vencida no podrás ver tus notas ni tu avance."
                ),
                amount=round(
                    sum(max(0.0, balances.get(e.id, e.amount or 0.0)) for e in overdue), 2
                ),
            )
        )

    # --- Homework still to hand in ---
    if course_ids:
        now = datetime.now(timezone.utc)
        submitted = set(
            db.scalars(
                select(AssignmentSubmission.assignment_id).where(
                    AssignmentSubmission.student_id == user.id
                )
            ).all()
        )
        open_assignments = db.scalars(
            select(Assignment).where(Assignment.course_id.in_(course_ids))
        ).all()
        pending = [a for a in open_assignments if a.id not in submitted]
        overdue_work = [a for a in pending if a.due_date and a.due_date < now]
        if pending:
            items.append(
                ActionItem(
                    kind="pending_assignments",
                    label="tarea sin entregar" if len(pending) == 1 else "tareas sin entregar",
                    count=len(pending),
                    severity="critical" if overdue_work else "warning",
                    section="tareas",
                    detail=(
                        f"{len(overdue_work)} ya pasó su fecha de entrega."
                        if len(overdue_work) == 1
                        else f"{len(overdue_work)} ya pasaron su fecha de entrega."
                        if overdue_work
                        else None
                    ),
                )
            )

    return items, balance_due


def build_summary(db: DbSession, user: User) -> DashboardSummary:
    """The caller's tray of things to act on."""
    if is_admin(user) or user.role == UserRole.assistant:
        course_ids = tenant_course_ids(db, user)
        return DashboardSummary(
            role=user.role.value,
            items=_staff_items(db, user, course_ids),
            kpis=_academy_kpis(db, user, course_ids),
        )

    if user.role == UserRole.teacher:
        course_ids = teacher_course_ids(db, user.id)
        return DashboardSummary(
            role=user.role.value, items=_teacher_items(db, user, course_ids)
        )

    course_ids = student_course_ids(db, user.id)
    items, balance_due = _student_items(db, user, course_ids)
    return DashboardSummary(role=user.role.value, items=items, balance_due=balance_due)
