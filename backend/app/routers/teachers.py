from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import (
    apply_tenant,
    get_current_user,
    in_tenant,
    require_permission,
    require_role,
)
from app.models import (
    Language,
    Permission,
    TeacherAvailability,
    TeacherLanguage,
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
from app.services import teacher_service
from app.services.staff import live_assignments, reassign_teacher

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
