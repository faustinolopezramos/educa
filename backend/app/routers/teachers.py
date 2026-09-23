from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.clock import academy_today
from app.core.database import get_db
from app.core.deps import (
    apply_tenant,
    get_current_user,
    has_user_permission,
    in_tenant,
    is_admin,
    require_permission,
    require_role,
)
from app.models import (
    Language,
    Permission,
    TeacherAvailability,
    TeacherLanguage,
    TeacherRate,
    User,
    UserRole,
)
from app.services.audit import record, snapshot
from app.core.http import commit_or_conflict
from app.schemas.teacher import (
    AvailabilityCreate,
    AvailabilityRead,
    AvailableTeacher,
    TeacherLanguageRead,
    TeacherLanguagesSet,
    TeacherLiveAssignment,
    TeacherLoadRead,
    TeacherReassignOutcome,
    TeacherReassignRequest,
    TeacherReassignResult,
)
from app.schemas.teacher_payroll import (
    AcademyPayrollSummary,
    TeacherHourlyRateUpdate,
    TeacherPayrollReport,
    TeacherPayrollSummary,
)
from app.services import teacher_service
from app.services.staff import live_assignments, reassign_teacher
from app.services.teacher_payroll import (
    calculate_academy_payroll,
    calculate_teacher_payroll,
)

router = APIRouter(prefix="/teachers", tags=["teachers"])

admin_only = require_permission(Permission.manage_teachers)


@router.get("", response_model=list[AvailableTeacher])
def list_teachers(
    include_inactive: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[AvailableTeacher]:
    """Public (any authenticated user): teacher id + name, e.g. to label a class.

    Teachers on baja are left out by default. This list feeds every picker in
    the app — assigning a course, creating a slot, reassigning — and offering
    somebody who can no longer log in only produces a class nobody can teach.
    Pass `include_inactive` where the point *is* to show them, such as a past
    class still labelled with the teacher who taught it.
    """
    stmt = apply_tenant(
        select(User).where(User.role == UserRole.teacher),
        User.tenant_id,
        current_user,
    )
    if not include_inactive:
        stmt = stmt.where(User.is_active.is_(True))
    teachers = db.scalars(stmt).all()
    return [AvailableTeacher(id=t.id, full_name=t.full_name) for t in teachers]


@router.get("/{teacher_id}/load", response_model=TeacherLoadRead)
def get_teacher_load(
    teacher_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TeacherLoadRead:
    return teacher_service.get_teacher_load(db, teacher_id, current_user)


def _require_teacher(db: Session, teacher_id: int, actor: User) -> User:
    """The teacher, if they are one and they belong to the caller's academy."""
    teacher = db.get(User, teacher_id)
    if not in_tenant(actor, teacher):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Teacher not found")
    if teacher is None or teacher.role != UserRole.teacher:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Not a teacher")
    return teacher


# ---------------- Language qualifications ----------------
@router.get("/{teacher_id}/languages", response_model=list[TeacherLanguageRead])
def list_teacher_languages(
    teacher_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[TeacherLanguage]:
    return teacher_service.get_languages(db, teacher_id, current_user)


@router.put("/{teacher_id}/languages", response_model=list[TeacherLanguageRead])
def set_teacher_languages(
    teacher_id: int,
    payload: TeacherLanguagesSet,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[TeacherLanguage]:
    """Replace the teacher's full set of language qualifications."""
    return teacher_service.update_languages(
        db, teacher_id, payload.language_ids, current_user
    )


# ---------------- Availability windows ----------------
@router.get("/{teacher_id}/availability", response_model=list[AvailabilityRead])
def list_availability(
    teacher_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[TeacherAvailability]:
    return teacher_service.get_availability(db, teacher_id, current_user)


@router.post(
    "/{teacher_id}/availability",
    response_model=AvailabilityRead,
    status_code=status.HTTP_201_CREATED,
)
def add_availability(
    teacher_id: int,
    payload: AvailabilityCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TeacherAvailability:
    return teacher_service.add_availability(db, teacher_id, payload, current_user)


@router.put(
    "/{teacher_id}/availability",
    response_model=list[AvailabilityRead],
)
def update_availability(
    teacher_id: int,
    payload: list[AvailabilityCreate],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[TeacherAvailability]:
    """Replace the teacher's full set of availability windows."""
    return teacher_service.update_availability(db, teacher_id, payload, current_user)


@router.patch(
    "/{teacher_id}/availability/{availability_id}",
    response_model=AvailabilityRead,
)
def patch_availability(
    teacher_id: int,
    availability_id: int,
    payload: AvailabilityCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TeacherAvailability:
    """Partial update of a specific teacher availability window."""
    return teacher_service.patch_availability(
        db, teacher_id, availability_id, payload, current_user
    )


@router.delete(
    "/{teacher_id}/availability/{availability_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_availability(
    teacher_id: int,
    availability_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    teacher_service.delete_availability(db, teacher_id, availability_id, current_user)


# ---------------- Handover ----------------
@router.get("/{teacher_id}/assignments", response_model=list[TeacherLiveAssignment])
def teacher_assignments(
    teacher_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(admin_only),
) -> list[TeacherLiveAssignment]:
    """The live courses this teacher holds — what a baja would strand."""
    _require_teacher(db, teacher_id, current_user)
    return [
        TeacherLiveAssignment(
            course_id=a.course_id,
            course_name=a.course_name,
            schedule_count=len(a.schedule_ids),
        )
        for a in live_assignments(db, teacher_id)
    ]


@router.post("/{teacher_id}/reassign", response_model=TeacherReassignResult)
def reassign(
    teacher_id: int,
    payload: TeacherReassignRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(admin_only),
) -> TeacherReassignResult:
    """Move courses from one teacher to another, reporting on each.

    The operation an admin needs twice: when somebody leaves — where it is the
    prerequisite for their baja — and when somebody goes on leave mid-term.

    Per-course outcomes rather than all-or-nothing: six courses moving and one
    clashing should leave five moved and one explained, not seven untouched.
    """
    source = _require_teacher(db, teacher_id, current_user)
    destination = _require_teacher(db, payload.to_teacher_id, current_user)
    if source.id == destination.id:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "El profesor origen y el destino son el mismo",
        )
    if not destination.is_active:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "El profesor destino está dado de baja; no puede recibir cursos.",
        )

    outcomes = reassign_teacher(
        db,
        from_teacher_id=teacher_id,
        to_teacher_id=payload.to_teacher_id,
        course_ids=payload.course_ids,
        force=payload.force,
    )
    for outcome in outcomes:
        if outcome.ok:
            teacher_service.notify_teacher_course_assigned(
                destination, outcome.course_name
            )
            record(
                db,
                current_user,
                "reassign",
                "course_teacher",
                outcome.course_id,
                before={"teacher_id": teacher_id},
                after={
                    "teacher_id": payload.to_teacher_id,
                    "schedules_moved": outcome.schedules_moved,
                },
            )
    # A slot landing on a teacher who already teaches that hour is caught by the
    # exclusion constraint even when `force` skipped the API-level check.
    commit_or_conflict(
        db,
        {
            "message": (
                "La reasignación deja al profesor destino con dos clases a la "
                "misma hora"
            ),
            "reason": "teacher_conflict",
        },
    )
    moved = sum(1 for o in outcomes if o.ok)
    return TeacherReassignResult(
        moved=moved,
        failed=len(outcomes) - moved,
        outcomes=[
            TeacherReassignOutcome(
                course_id=o.course_id,
                course_name=o.course_name,
                ok=o.ok,
                schedules_moved=o.schedules_moved,
                reason=o.reason,
            )
            for o in outcomes
        ],
    )


# ---------------- Payroll & Hourly Settlement ----------------
@router.get("/payroll/summary", response_model=AcademyPayrollSummary)
def get_academy_payroll_summary(
    date_from: date | None = None,
    date_to: date | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AcademyPayrollSummary:
    """Consolidated teaching hours and remuneration summary for all teachers in the tenant."""
    if not (
        is_admin(current_user)
        or has_user_permission(current_user, Permission.manage_teachers)
        or has_user_permission(current_user, Permission.view_reports)
    ):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Requiere permisos de nómina o dirección")

    today = academy_today()
    start = date_from or date(today.year, today.month, 1)
    end = date_to or today

    return calculate_academy_payroll(db, current_user, start, end)


@router.get("/{teacher_id}/payroll", response_model=TeacherPayrollReport)
def get_teacher_payroll(
    teacher_id: int,
    date_from: date | None = None,
    date_to: date | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TeacherPayrollReport:
    """Detailed payroll and session-by-session teaching hours for a teacher."""
    teacher = _require_teacher(db, teacher_id, current_user)

    can_view = (
        (current_user.role == UserRole.teacher and current_user.id == teacher_id)
        or is_admin(current_user)
        or has_user_permission(current_user, Permission.manage_teachers)
        or has_user_permission(current_user, Permission.view_reports)
    )
    if not can_view:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No tienes permiso para ver esta liquidación")

    today = academy_today()
    start = date_from or date(today.year, today.month, 1)
    end = date_to or today

    return calculate_teacher_payroll(db, teacher, start, end)


@router.patch("/{teacher_id}/rate", response_model=dict)
def update_teacher_hourly_rate(
    teacher_id: int,
    payload: TeacherHourlyRateUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(admin_only),
) -> dict:
    """Fijar la tarifa por hora de un profesor, con su fecha de entrada en vigor.

    La tarifa queda registrada con fecha (`teacher_rates`) y la liquidación de
    cada clase usa la que regía ese día. Antes sólo se guardaba el valor actual,
    de modo que un aumento recalculaba hacia atrás meses ya liquidados.

    Por defecto rige desde hoy. Se puede fechar en el pasado para corregir un
    acuerdo que ya estaba en vigor, y en el futuro para dejar programada una
    subida.
    """
    teacher = _require_teacher(db, teacher_id, current_user)
    before = snapshot(teacher)

    effective_from = payload.effective_from or academy_today()
    existing = db.scalar(
        select(TeacherRate).where(
            TeacherRate.teacher_id == teacher.id,
            TeacherRate.effective_from == effective_from,
        )
    )
    if existing is not None:
        existing.hourly_rate = payload.hourly_rate
    else:
        db.add(
            TeacherRate(
                tenant_id=teacher.tenant_id,
                teacher_id=teacher.id,
                hourly_rate=payload.hourly_rate,
                effective_from=effective_from,
                created_by=current_user.id,
            )
        )

    # `users.hourly_rate` sigue siendo la tarifa vigente que muestran las
    # pantallas. Una subida con fecha futura no la toca todavía.
    if effective_from <= academy_today():
        teacher.hourly_rate = payload.hourly_rate

    record(
        db,
        current_user,
        "update",
        "user_hourly_rate",
        teacher.id,
        before=before,
        after=snapshot(teacher),
    )
    db.commit()
    db.refresh(teacher)
    return {
        "teacher_id": teacher.id,
        "hourly_rate": float(payload.hourly_rate),
        "effective_from": effective_from.isoformat(),
        "message": f"Tarifa horaria actualizada a {payload.hourly_rate:.2f}",
    }
