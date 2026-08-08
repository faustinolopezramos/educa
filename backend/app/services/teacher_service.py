"""Teacher self-service and administrative management for languages and availability.

Business rules & advanced validations:
- Admin (UserRole.admin, UserRole.superadmin) or Assistant (with Permission.manage_teachers) can view/update any teacher's information.
- Teacher (UserRole.teacher) can view/update ONLY their own information (current_user.id == teacher_id).
- Weekly load limit: total availability + assigned course hours must not exceed max_weekly_hours (default 40h). Violations raise HTTP 422.
- Schedule conflicts: availability windows must not overlap or clash in an invalid way. Violations raise HTTP 422 or 409.
"""

from datetime import date, datetime, time
import logging
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import apply_tenant, has_user_permission, in_tenant
from app.models import (
    Language,
    Permission,
    Schedule,
    TeacherAvailability,
    TeacherLanguage,
    User,
    UserRole,
)
from app.schemas.teacher import AvailabilityCreate
from app.services.audit import record, snapshot

logger = logging.getLogger(__name__)
DEFAULT_MAX_WEEKLY_HOURS = 40.0


def notify_teacher_course_assigned(teacher: User, course_name: str) -> None:
    """Simulated Email notification logged when an admin assigns a course to a teacher."""
    logger.info(
        f"[NOTIFICATION EMAIL] To: {teacher.email} ({teacher.full_name}) | "
        f"Subject: Asignación de Curso | "
        f"Detalle: Se te ha asignado la impartición del curso '{course_name}'."
    )


def validate_teacher_self_or_admin(actor: User, teacher_id: int) -> None:
    """Validate that actor is Admin/Assistant with manage_teachers, or the teacher themselves.

    Raises HTTP 403 Forbidden if permission check fails.
    """
    if has_user_permission(actor, Permission.manage_teachers):
        return
    if actor.role == UserRole.teacher and actor.id == teacher_id:
        return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="No tienes permiso para modificar o ver la información de otro profesor",
    )


def require_teacher_user(db: Session, teacher_id: int, actor: User) -> User:
    """Ensure the target user exists, is in actor's tenant, and has the teacher role."""
    teacher = db.get(User, teacher_id)
    if teacher is None or not in_tenant(actor, teacher):
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Teacher not found")
    if teacher.role != UserRole.teacher:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Not a teacher")
    return teacher


def _window_minutes(start_time: time, end_time: time) -> int:
    """Calculate minutes between start_time and end_time on the same day."""
    ref = date(2000, 1, 1)
    diff = (datetime.combine(ref, end_time) - datetime.combine(ref, start_time)).total_seconds()
    return int(diff // 60)


def get_teacher_load(db: Session, teacher_id: int, current_user: User) -> dict:
    """Calculate assigned course hours, declared availability hours, and load percentage for a teacher."""
    validate_teacher_self_or_admin(current_user, teacher_id)
    require_teacher_user(db, teacher_id, current_user)

    teacher = db.get(User, teacher_id)
    max_hours = (
        float(teacher.max_weekly_hours)
        if teacher and teacher.max_weekly_hours is not None
        else DEFAULT_MAX_WEEKLY_HOURS
    )

    assigned_schedules = db.scalars(
        select(Schedule).where(Schedule.teacher_id == teacher_id)
    ).all()
    assigned_minutes = sum(_window_minutes(s.start_time, s.end_time) for s in assigned_schedules)

    avail_windows = db.scalars(
        select(TeacherAvailability).where(TeacherAvailability.teacher_id == teacher_id)
    ).all()
    avail_minutes = sum(_window_minutes(w.start_time, w.end_time) for w in avail_windows)

    assigned_hours = round(assigned_minutes / 60.0, 1)
    availability_hours = round(avail_minutes / 60.0, 1)
    pct = min(100.0, round((assigned_hours / max_hours) * 100.0, 1)) if max_hours > 0 else 0.0

    return {
        "teacher_id": teacher_id,
        "assigned_hours": assigned_hours,
        "availability_hours": availability_hours,
        "max_hours": max_hours,
        "percentage": pct,
    }


def validate_teacher_weekly_load(
    db: Session,
    teacher_id: int,
    proposed_availability_windows: list[AvailabilityCreate] | None = None,
    new_window: AvailabilityCreate | None = None,
) -> None:
    """Validate that total weekly load (assigned course schedules + availability) does not exceed max_weekly_hours (default 40h).

    Raises HTTP 422 Unprocessable Entity if limit is exceeded.
    """
    teacher = db.get(User, teacher_id)
    max_hours = (
        float(teacher.max_weekly_hours)
        if teacher and teacher.max_weekly_hours is not None
        else DEFAULT_MAX_WEEKLY_HOURS
    )

    # 1. Assigned class schedules duration
    assigned_schedules = db.scalars(
        select(Schedule).where(Schedule.teacher_id == teacher_id)
    ).all()
    assigned_minutes = sum(_window_minutes(s.start_time, s.end_time) for s in assigned_schedules)

    # 2. Proposed availability duration
    if proposed_availability_windows is not None:
        avail_minutes = sum(
            _window_minutes(w.start_time, w.end_time) for w in proposed_availability_windows
        )
    else:
        existing = db.scalars(
            select(TeacherAvailability).where(TeacherAvailability.teacher_id == teacher_id)
        ).all()
        avail_minutes = sum(_window_minutes(w.start_time, w.end_time) for w in existing)
        if new_window:
            avail_minutes += _window_minutes(new_window.start_time, new_window.end_time)

    total_hours = (assigned_minutes + avail_minutes) / 60.0

    if total_hours > max_hours:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"El profesor excede el límite de horas semanales permitidas (máximo {int(max_hours)} horas, solicitadas: {total_hours:.1f}h)",
        )


def validate_schedule_conflicts(
    windows: list[AvailabilityCreate],
) -> None:
    """Validate that availability windows do not overlap with each other.

    Raises HTTP 422 Unprocessable Entity if internal clash is found.
    """
    for i, a in enumerate(windows):
        for j, b in enumerate(windows):
            if i != j and a.day_of_week == b.day_of_week:
                if a.start_time < b.end_time and a.end_time > b.start_time:
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail="Conflicto de horario detectado: las ventanas de disponibilidad se solapan entre sí",
                    )


# ---------------- Languages ----------------

def get_languages(db: Session, teacher_id: int, current_user: User) -> list[TeacherLanguage]:
    validate_teacher_self_or_admin(current_user, teacher_id)
    require_teacher_user(db, teacher_id, current_user)
    return list(
        db.scalars(
            select(TeacherLanguage).where(TeacherLanguage.teacher_id == teacher_id)
        ).all()
    )


def update_languages(
    db: Session, teacher_id: int, language_ids: list[int], current_user: User
) -> list[TeacherLanguage]:
    """Replace the teacher's full set of language qualifications."""
    validate_teacher_self_or_admin(current_user, teacher_id)
    require_teacher_user(db, teacher_id, current_user)

    valid_ids = set(
        db.scalars(
            apply_tenant(
                select(Language.id).where(Language.id.in_(language_ids)),
                Language.tenant_id,
                current_user,
            )
        ).all()
    )
    unknown = set(language_ids) - valid_ids
    if unknown:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, detail=f"Unknown language ids: {sorted(unknown)}"
        )

    existing = db.scalars(
        select(TeacherLanguage).where(TeacherLanguage.teacher_id == teacher_id)
    ).all()
    previous_ids = sorted(row.language_id for row in existing)
    for row in existing:
        db.delete(row)
    db.flush()

    for lang_id in valid_ids:
        db.add(TeacherLanguage(teacher_id=teacher_id, language_id=lang_id))
    db.flush()

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


# ---------------- Availability ----------------

def get_availability(db: Session, teacher_id: int, current_user: User) -> list[TeacherAvailability]:
    validate_teacher_self_or_admin(current_user, teacher_id)
    require_teacher_user(db, teacher_id, current_user)
    return list(
        db.scalars(
            select(TeacherAvailability).where(
                TeacherAvailability.teacher_id == teacher_id
            )
        ).all()
    )


def add_availability(
    db: Session, teacher_id: int, payload: AvailabilityCreate, current_user: User
) -> TeacherAvailability:
    validate_teacher_self_or_admin(current_user, teacher_id)
    require_teacher_user(db, teacher_id, current_user)

    # 1. Validate weekly load limit (max 40h)
    validate_teacher_weekly_load(db, teacher_id, new_window=payload)

    # 2. Check overlap with existing availability windows
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


def update_availability(
    db: Session, teacher_id: int, payload: list[AvailabilityCreate], current_user: User
) -> list[TeacherAvailability]:
    """Replace the teacher's full set of availability windows."""
    validate_teacher_self_or_admin(current_user, teacher_id)
    require_teacher_user(db, teacher_id, current_user)

    # 1. Validate schedule conflicts (internal overlaps)
    validate_schedule_conflicts(payload)

    # 2. Validate weekly load limit (max 40h)
    validate_teacher_weekly_load(db, teacher_id, proposed_availability_windows=payload)

    existing = db.scalars(
        select(TeacherAvailability).where(
            TeacherAvailability.teacher_id == teacher_id
        )
    ).all()
    for row in existing:
        db.delete(row)
    db.flush()

    new_windows = []
    for item in payload:
        w = TeacherAvailability(teacher_id=teacher_id, **item.model_dump())
        db.add(w)
        new_windows.append(w)
    db.flush()

    record(
        db,
        current_user,
        "update",
        "teacher_availability",
        teacher_id,
        after={"count": len(new_windows)},
    )
    db.commit()

    return list(
        db.scalars(
            select(TeacherAvailability).where(
                TeacherAvailability.teacher_id == teacher_id
            )
        ).all()
    )


def check_assigned_class_conflict_on_release(
    db: Session, teacher_id: int, day_of_week: int, start_time: time, end_time: time
) -> None:
    """Check if releasing an availability block collides with an assigned course schedule."""
    clashing_schedule = db.scalar(
        select(Schedule)
        .where(
            Schedule.teacher_id == teacher_id,
            Schedule.day_of_week == day_of_week,
            Schedule.start_time < end_time,
            Schedule.end_time > start_time,
        )
    )
    if clashing_schedule:
        course = db.get(User, clashing_schedule.course_id)
        course_name = f"Curso #{clashing_schedule.course_id}"
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Advertencia: Tienes una clase asignada en este horario ({start_time.strftime('%H:%M')}–{end_time.strftime('%H:%M')}). No se puede liberar este bloque de disponibilidad sin reasignar la clase primero.",
        )


def patch_availability(
    db: Session,
    teacher_id: int,
    availability_id: int,
    payload: AvailabilityCreate,
    current_user: User,
) -> TeacherAvailability:
    validate_teacher_self_or_admin(current_user, teacher_id)
    require_teacher_user(db, teacher_id, current_user)

    window = db.get(TeacherAvailability, availability_id)
    if window is None or window.teacher_id != teacher_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Availability window not found")

    if (
        window.day_of_week != payload.day_of_week
        or window.start_time != payload.start_time
        or window.end_time != payload.end_time
    ):
        check_assigned_class_conflict_on_release(
            db, teacher_id, window.day_of_week, window.start_time, window.end_time
        )

    validate_teacher_weekly_load(db, teacher_id, new_window=payload)

    window.day_of_week = payload.day_of_week
    window.start_time = payload.start_time
    window.end_time = payload.end_time
    db.flush()

    record(
        db,
        current_user,
        "update",
        "teacher_availability",
        window.id,
        after=snapshot(window),
    )
    db.commit()
    db.refresh(window)
    return window


def delete_availability(
    db: Session, teacher_id: int, availability_id: int, current_user: User
) -> None:
    validate_teacher_self_or_admin(current_user, teacher_id)
    require_teacher_user(db, teacher_id, current_user)

    window = db.get(TeacherAvailability, availability_id)
    if window is None or window.teacher_id != teacher_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Availability not found")

    # Check if releasing this window conflicts with an assigned class
    check_assigned_class_conflict_on_release(
        db, teacher_id, window.day_of_week, window.start_time, window.end_time
    )

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
