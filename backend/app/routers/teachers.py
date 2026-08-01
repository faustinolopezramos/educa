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
    TeacherReassignOutcome,
    TeacherReassignRequest,
    TeacherReassignResult,
)
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


def _require_teacher(db: Session, teacher_id: int, actor: User) -> User:
    """The teacher, if they are one and they belong to the caller's academy.

    `actor` is required rather than optional on purpose: it used to default to
    `None`, which made the tenant check opt-in, and every endpoint here omitted
    it — so an admin of one academy could read and rewrite the qualifications
    and availability of another academy's teachers. A missing argument is now a
    TypeError instead of a silent hole.
    """
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
    current_user: User = Depends(admin_only),
) -> list[TeacherLanguage]:
    _require_teacher(db, teacher_id, current_user)
    return list(
        db.scalars(
            select(TeacherLanguage).where(TeacherLanguage.teacher_id == teacher_id)
        ).all()
    )


@router.put("/{teacher_id}/languages", response_model=list[TeacherLanguageRead])
def set_teacher_languages(
    teacher_id: int,
    payload: TeacherLanguagesSet,
    db: Session = Depends(get_db),
    current_user: User = Depends(admin_only),
) -> list[TeacherLanguage]:
    """Replace the teacher's full set of language qualifications."""
    _require_teacher(db, teacher_id, current_user)
    # Scoped to the caller's academy: an unscoped lookup accepted another
    # academy's language id, which would qualify the teacher to teach a track
    # their own school does not even offer.
    valid_ids = set(
        db.scalars(
            apply_tenant(
                select(Language.id).where(Language.id.in_(payload.language_ids)),
                Language.tenant_id,
                current_user,
            )
        ).all()
    )
    unknown = set(payload.language_ids) - valid_ids
    if unknown:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, f"Unknown language ids: {sorted(unknown)}"
        )

    existing = db.scalars(
        select(TeacherLanguage).where(TeacherLanguage.teacher_id == teacher_id)
    ).all()
    # Read the previous set before the rows are gone — after the delete/flush
    # below they are expired, and the "before" of the trail would be empty.
    previous_ids = sorted(row.language_id for row in existing)
    for row in existing:
        db.delete(row)
    db.flush()
    for lang_id in valid_ids:
        db.add(TeacherLanguage(teacher_id=teacher_id, language_id=lang_id))
    db.flush()
    # Qualifications are a hard gate on assigning a teacher to a course, so
    # widening or narrowing them changes who may teach what.
    record(
        db,
        current_user,
        "update",
        "teacher_languages",
        teacher_id,
        before={"language_ids": previous_ids},
        after={"language_ids": sorted(valid_ids)},
    )
    db.commit()
    return list(
        db.scalars(
            select(TeacherLanguage).where(TeacherLanguage.teacher_id == teacher_id)
        ).all()
    )


# ---------------- Availability windows ----------------
@router.get("/{teacher_id}/availability", response_model=list[AvailabilityRead])
def list_availability(
    teacher_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(admin_only),
) -> list[TeacherAvailability]:
    _require_teacher(db, teacher_id, current_user)
    return list(
        db.scalars(
            select(TeacherAvailability).where(
                TeacherAvailability.teacher_id == teacher_id
            )
        ).all()
    )


@router.post(
    "/{teacher_id}/availability",
    response_model=AvailabilityRead,
    status_code=status.HTTP_201_CREATED,
)
def add_availability(
    teacher_id: int,
    payload: AvailabilityCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(admin_only),
) -> TeacherAvailability:
    _require_teacher(db, teacher_id, current_user)

    # A backwards window is already refused by `AvailabilityCreate`. What it
    # could not see is the rest of the teacher's calendar:
    # overlapping windows are not wrong so much as meaningless — availability is
    # a union, so the second one only ever widens the first. Merging them keeps
    # the list something a human can read back.
    existing = db.scalars(
        select(TeacherAvailability).where(
            TeacherAvailability.teacher_id == teacher_id,
            TeacherAvailability.day_of_week == payload.day_of_week,
            TeacherAvailability.start_time < payload.end_time,
            TeacherAvailability.end_time > payload.start_time,
        )
    ).all()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": "Ya hay una ventana de disponibilidad que se solapa con esa",
                "reason": "overlapping_availability",
                "conflicts": [
                    {
                        "id": w.id,
                        "start_time": w.start_time.isoformat(),
                        "end_time": w.end_time.isoformat(),
                    }
                    for w in existing
                ],
            },
        )

    window = TeacherAvailability(teacher_id=teacher_id, **payload.model_dump())
    db.add(window)
    db.flush()
    record(
        db,
        current_user,
        "create",
        "teacher_availability",
        window.id,
        after=snapshot(window),
    )
    db.commit()
    db.refresh(window)
    return window


@router.delete(
    "/{teacher_id}/availability/{availability_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_availability(
    teacher_id: int,
    availability_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(admin_only),
) -> None:
    _require_teacher(db, teacher_id, current_user)
    window = db.get(TeacherAvailability, availability_id)
    if window is None or window.teacher_id != teacher_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Availability not found")
    record(
        db,
        current_user,
        "delete",
        "teacher_availability",
        window.id,
        before=snapshot(window),
    )
    db.delete(window)
    db.commit()


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
