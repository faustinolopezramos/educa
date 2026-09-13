"""Teacher self-service and administrative management for languages and availability.

Business rules & advanced validations:
- Admin (UserRole.admin, UserRole.superadmin) or Assistant (with Permission.manage_teachers) can view/update any teacher's information.
- Teacher (UserRole.teacher) can view/update ONLY their own information (current_user.id == teacher_id).
- Weekly load limit: total assigned course schedule hours must not exceed max_weekly_hours (default 40h). Availability windows define candidate working hours and are decoupled from teaching load.
- Schedule conflicts: availability windows must not overlap or clash with assigned classes. Violations raise HTTP 422 or 409.
"""

from datetime import date, datetime, time
import logging
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import apply_tenant, has_user_permission, in_tenant
from app.models import (
    Course,
    CourseStatus,
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


def _active_assigned_schedules(db: Session, teacher_id: int) -> list[Schedule]:
    """Return all active assigned class schedules for the teacher.

    Excludes schedules of closed or archived courses, and schedules
    whose terms have already concluded in the past.
    """
    today = date.today()
    stmt = (
        select(Schedule)
        .join(Course, Schedule.course_id == Course.id)
        .where(
            Schedule.teacher_id == teacher_id,
            Course.status.notin_([CourseStatus.closed, CourseStatus.archived]),
        )
    )
    schedules = db.scalars(stmt).all()
    return [s for s in schedules if s.term_end is None or s.term_end >= today]


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

    assigned_schedules = _active_assigned_schedules(db, teacher_id)
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
    additional_minutes: int = 0,
    term_start: date | None = None,
    term_end: date | None = None,
    exclude_schedule_id: int | None = None,
    proposed_availability_windows: list[AvailabilityCreate] | None = None,
    new_window: AvailabilityCreate | None = None,
) -> None:
    """Validate that total assigned course schedule hours do not exceed max_weekly_hours (default 40h).

    Availability windows represent candidate working hours and are decoupled from assigned teaching load.
    Raises HTTP 422 Unprocessable Entity if the limit is exceeded.
    """
    teacher = db.get(User, teacher_id)
    max_hours = (
        float(teacher.max_weekly_hours)
        if teacher and teacher.max_weekly_hours is not None
        else DEFAULT_MAX_WEEKLY_HOURS
    )

    assigned_schedules = _active_assigned_schedules(db, teacher_id)
    if exclude_schedule_id is not None:
        assigned_schedules = [s for s in assigned_schedules if s.id != exclude_schedule_id]

    if term_start is not None or term_end is not None:
        from app.services.scheduling import terms_overlap
        assigned_minutes = sum(
            _window_minutes(s.start_time, s.end_time)
            for s in assigned_schedules
            if terms_overlap(term_start, term_end, s.term_start, s.term_end)
        )
    else:
        assigned_minutes = sum(_window_minutes(s.start_time, s.end_time) for s in assigned_schedules)

    total_minutes = assigned_minutes + additional_minutes
    assigned_hours = total_minutes / 60.0

    if assigned_hours > max_hours:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"El profesor excede el límite de horas lectivas semanales permitidas (máximo {int(max_hours)} horas, asignadas: {assigned_hours:.1f}h)",
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

    # Availability windows define candidate working hours and do not consume teaching load
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


def check_assigned_classes_coverage(
    db: Session,
    teacher_id: int,
    resulting_windows: list[AvailabilityCreate] | list[TeacherAvailability],
    relevant_day_of_week: int | None = None,
) -> None:
    """Verify that active assigned class schedules for the teacher are covered by resulting_windows.

    If relevant_day_of_week is specified, only checks active schedules on that day.
    Raises HTTP 409 Conflict if any active assigned schedule would be left uncovered.
    """
    assigned_schedules = _active_assigned_schedules(db, teacher_id)
    if relevant_day_of_week is not None:
        assigned_schedules = [s for s in assigned_schedules if s.day_of_week == relevant_day_of_week]

    for s in assigned_schedules:
        is_covered = any(
            w.day_of_week == s.day_of_week
            and w.start_time <= s.start_time
            and w.end_time >= s.end_time
            for w in resulting_windows
        )
        if not is_covered:
            course = db.get(Course, s.course_id)
            course_name = course.name if course else f"Curso #{s.course_id}"
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Advertencia: Tienes una clase asignada activa en este horario ({course_name}: {s.start_time.strftime('%H:%M')}–{s.end_time.strftime('%H:%M')}). No se puede modificar la disponibilidad dejando la clase sin cobertura horaria.",
            )


def update_availability(
    db: Session, teacher_id: int, payload: list[AvailabilityCreate], current_user: User
) -> list[TeacherAvailability]:
    """Replace the teacher's full set of availability windows."""
    validate_teacher_self_or_admin(current_user, teacher_id)
    require_teacher_user(db, teacher_id, current_user)

    # 1. Validate schedule conflicts (internal overlaps)
    validate_schedule_conflicts(payload)

    # 2. Ensure active assigned classes that were covered or are on days in payload remain covered
    existing = list(
        db.scalars(
            select(TeacherAvailability).where(
                TeacherAvailability.teacher_id == teacher_id
            )
        ).all()
    )
    for s in _active_assigned_schedules(db, teacher_id):
        was_covered = any(
            w.day_of_week == s.day_of_week and w.start_time <= s.start_time and w.end_time >= s.end_time
            for w in existing
        )
        day_in_payload = any(w.day_of_week == s.day_of_week for w in payload)
        if was_covered or day_in_payload:
            is_covered_now = any(
                w.day_of_week == s.day_of_week and w.start_time <= s.start_time and w.end_time >= s.end_time
                for w in payload
            )
            if not is_covered_now:
                course = db.get(Course, s.course_id)
                course_name = course.name if course else f"Curso #{s.course_id}"
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Advertencia: Tienes una clase asignada activa en este horario ({course_name}: {s.start_time.strftime('%H:%M')}–{s.end_time.strftime('%H:%M')}). No se puede modificar la disponibilidad dejando la clase sin cobertura horaria.",
                )

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
    db: Session,
    teacher_id: int,
    day_of_week: int,
    start_time: time,
    end_time: time,
    replacement_window: AvailabilityCreate | None = None,
) -> None:
    """Check if releasing or shrinking an availability block collides with an assigned course schedule."""
    active_schedules = [
        s for s in _active_assigned_schedules(db, teacher_id)
        if s.day_of_week == day_of_week and s.start_time < end_time and s.end_time > start_time
    ]
    for clashing_schedule in active_schedules:
        if replacement_window:
            is_covered = (
                replacement_window.day_of_week == clashing_schedule.day_of_week
                and replacement_window.start_time <= clashing_schedule.start_time
                and replacement_window.end_time >= clashing_schedule.end_time
            )
            if is_covered:
                continue
        course = db.get(Course, clashing_schedule.course_id)
        course_name = course.name if course else f"Curso #{clashing_schedule.course_id}"
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Advertencia: Tienes una clase asignada en este horario ({course_name}: {clashing_schedule.start_time.strftime('%H:%M')}–{clashing_schedule.end_time.strftime('%H:%M')}). No se puede liberar este bloque de disponibilidad sin reasignar la clase primero.",
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

    other_windows = list(
        db.scalars(
            select(TeacherAvailability).where(
                TeacherAvailability.teacher_id == teacher_id,
                TeacherAvailability.id != availability_id,
            )
        ).all()
    )

    # Check for internal overlap with other existing availability windows
    overlapping = [
        w for w in other_windows
        if w.day_of_week == payload.day_of_week
        and w.start_time < payload.end_time
        and w.end_time > payload.start_time
    ]
    if overlapping:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya hay otra ventana de disponibilidad que se solapa con ese horario",
        )

    # Check that any active assigned class that intersected the old window remains covered after patch
    resulting_windows = other_windows + [payload]
    for s in _active_assigned_schedules(db, teacher_id):
        if s.day_of_week == window.day_of_week and s.start_time < window.end_time and s.end_time > window.start_time:
            covered = any(
                w.day_of_week == s.day_of_week and w.start_time <= s.start_time and w.end_time >= s.end_time
                for w in resulting_windows
            )
            if not covered:
                course = db.get(Course, s.course_id)
                course_name = course.name if course else f"Curso #{s.course_id}"
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Advertencia: Tienes una clase asignada activa en este horario ({course_name}: {s.start_time.strftime('%H:%M')}–{s.end_time.strftime('%H:%M')}). No se puede modificar la disponibilidad dejando la clase sin cobertura horaria.",
                )

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

    remaining_windows = list(
        db.scalars(
            select(TeacherAvailability).where(
                TeacherAvailability.teacher_id == teacher_id,
                TeacherAvailability.id != availability_id,
            )
        ).all()
    )

    # Check if this window intersected an active assigned class that would now be left uncovered
    for s in _active_assigned_schedules(db, teacher_id):
        if s.day_of_week == window.day_of_week and s.start_time < window.end_time and s.end_time > window.start_time:
            covered = any(
                w.day_of_week == s.day_of_week and w.start_time <= s.start_time and w.end_time >= s.end_time
                for w in remaining_windows
            )
            if not covered:
                course = db.get(Course, s.course_id)
                course_name = course.name if course else f"Curso #{s.course_id}"
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Advertencia: Tienes una clase asignada activa en este horario ({course_name}: {s.start_time.strftime('%H:%M')}–{s.end_time.strftime('%H:%M')}). No se puede liberar este bloque de disponibilidad sin reasignar la clase primero.",
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
