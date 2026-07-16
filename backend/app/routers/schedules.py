from datetime import date, time

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user, require_role
from app.models import Course, Room, Schedule, User, UserRole
from app.schemas.schedule import (
    ConflictCheck,
    ConflictInfo,
    ConflictResponse,
    ScheduleCreate,
    ScheduleRead,
    ScheduleUpdate,
)
from app.schemas.teacher import AvailableTeacher
from app.services.scheduling import (
    room_conflicts,
    teacher_available,
    teacher_conflicts,
    teacher_exceeds_load,
    teacher_qualified_for_course,
)

router = APIRouter(prefix="/schedules", tags=["schedules"])

admin_only = require_role(UserRole.admin)


def _to_conflict_info(db: Session, conflicts: list[Schedule]) -> list[ConflictInfo]:
    infos: list[ConflictInfo] = []
    for s in conflicts:
        course = db.get(Course, s.course_id)
        infos.append(
            ConflictInfo(
                schedule_id=s.id,
                course_id=s.course_id,
                course_name=course.name if course else f"#{s.course_id}",
                day_of_week=s.day_of_week,
                start_time=s.start_time,
                end_time=s.end_time,
            )
        )
    return infos


def _course_term(course: Course) -> tuple[date | None, date | None]:
    return course.start_date, course.end_date


def _soft_warnings(
    db: Session,
    teacher_id: int,
    course_id: int,
    day_of_week: int,
    start_time: time,
    end_time: time,
    exclude_schedule_id: int | None = None,
) -> list[dict[str, str]]:
    """Overridable business-rule warnings (qualification/availability/load)."""
    warnings: list[dict[str, str]] = []
    if not teacher_qualified_for_course(db, teacher_id, course_id):
        warnings.append(
            {
                "reason": "qualification",
                "message": "El profesor no está calificado para el idioma de este curso",
            }
        )
    if not teacher_available(db, teacher_id, day_of_week, start_time, end_time):
        warnings.append(
            {
                "reason": "availability",
                "message": "El horario está fuera de la disponibilidad del profesor",
            }
        )
    if teacher_exceeds_load(db, teacher_id, start_time, end_time, exclude_schedule_id):
        warnings.append(
            {
                "reason": "max_hours",
                "message": "Se supera el máximo de horas semanales del profesor",
            }
        )
    return warnings


def _raise_hard_conflicts(
    db: Session,
    teacher_clashes: list[Schedule],
    room_clashes: list[Schedule],
) -> None:
    if teacher_clashes:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": "El profesor ya tiene una clase en ese horario",
                "reason": "teacher_conflict",
                "conflicts": [
                    i.model_dump(mode="json")
                    for i in _to_conflict_info(db, teacher_clashes)
                ],
            },
        )
    if room_clashes:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": "El aula ya está ocupada en ese horario",
                "reason": "room_conflict",
                "conflicts": [
                    i.model_dump(mode="json")
                    for i in _to_conflict_info(db, room_clashes)
                ],
            },
        )


def _commit_or_conflict(db: Session) -> None:
    """Commit, converting a DB exclusion-constraint violation into a 409."""
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": "Choque de horario detectado (profesor o aula ocupada)",
                "reason": "constraint",
            },
        )


@router.get("", response_model=list[ScheduleRead])
def list_schedules(
    course_id: int | None = None,
    teacher_id: int | None = None,
    mine: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[Schedule]:
    stmt = select(Schedule)
    if course_id is not None:
        stmt = stmt.where(Schedule.course_id == course_id)
    if teacher_id is not None:
        stmt = stmt.where(Schedule.teacher_id == teacher_id)
    # A teacher viewing "mine" only sees their own schedules.
    if mine and current_user.role == UserRole.teacher:
        stmt = stmt.where(Schedule.teacher_id == current_user.id)
    return list(db.scalars(stmt).all())


@router.post("/check-conflict", response_model=ConflictResponse)
def check_conflict(
    payload: ConflictCheck,
    db: Session = Depends(get_db),
    _: User = Depends(admin_only),
) -> ConflictResponse:
    """Live validation used by the calendar before committing a drag/resize."""
    term_start = term_end = None
    if payload.course_id is not None:
        course = db.get(Course, payload.course_id)
        if course is not None:
            term_start, term_end = _course_term(course)

    teacher_clashes = teacher_conflicts(
        db,
        teacher_id=payload.teacher_id,
        day_of_week=payload.day_of_week,
        start_time=payload.start_time,
        end_time=payload.end_time,
        term_start=term_start,
        term_end=term_end,
        exclude_schedule_id=payload.exclude_id,
    )
    room_clashes: list[Schedule] = []
    if payload.room_id is not None:
        room_clashes = room_conflicts(
            db,
            room_id=payload.room_id,
            day_of_week=payload.day_of_week,
            start_time=payload.start_time,
            end_time=payload.end_time,
            term_start=term_start,
            term_end=term_end,
            exclude_schedule_id=payload.exclude_id,
        )
    warnings: list[str] = []
    if payload.course_id is not None:
        warnings = [
            w["message"]
            for w in _soft_warnings(
                db,
                payload.teacher_id,
                payload.course_id,
                payload.day_of_week,
                payload.start_time,
                payload.end_time,
                payload.exclude_id,
            )
        ]
    return ConflictResponse(
        conflicts=_to_conflict_info(db, teacher_clashes),
        room_conflicts=_to_conflict_info(db, room_clashes),
        warnings=warnings,
    )


@router.get("/available-teachers", response_model=list[AvailableTeacher])
def available_teachers(
    course_id: int,
    day_of_week: int,
    start_time: time,
    end_time: time,
    db: Session = Depends(get_db),
    _: User = Depends(admin_only),
) -> list[AvailableTeacher]:
    """Teachers who are qualified, available, under their cap and free for a slot."""
    course = db.get(Course, course_id)
    if course is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Course not found")
    if start_time >= end_time or not 0 <= day_of_week <= 6:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid slot")
    term_start, term_end = _course_term(course)

    result: list[AvailableTeacher] = []
    teachers = db.scalars(select(User).where(User.role == UserRole.teacher)).all()
    for t in teachers:
        if not teacher_qualified_for_course(db, t.id, course_id):
            continue
        if not teacher_available(db, t.id, day_of_week, start_time, end_time):
            continue
        if teacher_exceeds_load(db, t.id, start_time, end_time):
            continue
        if teacher_conflicts(
            db, t.id, day_of_week, start_time, end_time, term_start, term_end
        ):
            continue
        result.append(AvailableTeacher(id=t.id, full_name=t.full_name))
    return result


@router.post("", response_model=ScheduleRead, status_code=status.HTTP_201_CREATED)
def create_schedule(
    payload: ScheduleCreate,
    force: bool = False,
    db: Session = Depends(get_db),
    _: User = Depends(admin_only),
) -> Schedule:
    course = db.get(Course, payload.course_id)
    if course is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Course not found")
    teacher = db.get(User, payload.teacher_id)
    if teacher is None or teacher.role != UserRole.teacher:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "teacher_id must be a teacher")
    if payload.room_id is not None and db.get(Room, payload.room_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Room not found")

    term_start, term_end = _course_term(course)

    _raise_hard_conflicts(
        db,
        teacher_conflicts(
            db,
            teacher_id=payload.teacher_id,
            day_of_week=payload.day_of_week,
            start_time=payload.start_time,
            end_time=payload.end_time,
            term_start=term_start,
            term_end=term_end,
        ),
        room_conflicts(
            db,
            room_id=payload.room_id,
            day_of_week=payload.day_of_week,
            start_time=payload.start_time,
            end_time=payload.end_time,
            term_start=term_start,
            term_end=term_end,
        )
        if payload.room_id is not None
        else [],
    )

    if not force:
        warnings = _soft_warnings(
            db,
            payload.teacher_id,
            payload.course_id,
            payload.day_of_week,
            payload.start_time,
            payload.end_time,
        )
        if warnings:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "message": warnings[0]["message"],
                    "reason": "soft_warning",
                    "warnings": warnings,
                },
            )

    schedule = Schedule(
        **payload.model_dump(), term_start=term_start, term_end=term_end
    )
    db.add(schedule)
    _commit_or_conflict(db)
    db.refresh(schedule)
    return schedule


@router.patch("/{schedule_id}", response_model=ScheduleRead)
def update_schedule(
    schedule_id: int,
    payload: ScheduleUpdate,
    force: bool = False,
    db: Session = Depends(get_db),
    _: User = Depends(admin_only),
) -> Schedule:
    schedule = db.get(Schedule, schedule_id)
    if schedule is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Schedule not found")

    data = payload.model_dump(exclude_unset=True)
    # Resulting values after the patch, used for validation.
    new_course_id = data.get("course_id", schedule.course_id)
    new_teacher = data.get("teacher_id", schedule.teacher_id)
    new_room = data.get("room_id", schedule.room_id)
    new_day = data.get("day_of_week", schedule.day_of_week)
    new_start = data.get("start_time", schedule.start_time)
    new_end = data.get("end_time", schedule.end_time)

    if new_start >= new_end:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "start_time must be before end_time"
        )
    if "teacher_id" in data:
        t = db.get(User, new_teacher)
        if t is None or t.role != UserRole.teacher:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, "teacher_id must be a teacher"
            )
    # If the course changes, validate it and re-derive the denormalized term.
    course = db.get(Course, new_course_id)
    if course is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Course not found")
    if new_room is not None and db.get(Room, new_room) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Room not found")
    term_start, term_end = _course_term(course)

    _raise_hard_conflicts(
        db,
        teacher_conflicts(
            db,
            teacher_id=new_teacher,
            day_of_week=new_day,
            start_time=new_start,
            end_time=new_end,
            term_start=term_start,
            term_end=term_end,
            exclude_schedule_id=schedule_id,
        ),
        room_conflicts(
            db,
            room_id=new_room,
            day_of_week=new_day,
            start_time=new_start,
            end_time=new_end,
            term_start=term_start,
            term_end=term_end,
            exclude_schedule_id=schedule_id,
        )
        if new_room is not None
        else [],
    )

    if not force:
        warnings = _soft_warnings(
            db,
            new_teacher,
            new_course_id,
            new_day,
            new_start,
            new_end,
            exclude_schedule_id=schedule_id,
        )
        if warnings:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "message": warnings[0]["message"],
                    "reason": "soft_warning",
                    "warnings": warnings,
                },
            )

    for field, value in data.items():
        setattr(schedule, field, value)
    schedule.term_start = term_start
    schedule.term_end = term_end
    _commit_or_conflict(db)
    db.refresh(schedule)
    return schedule


@router.delete("/{schedule_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_schedule(
    schedule_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(admin_only),
) -> None:
    schedule = db.get(Schedule, schedule_id)
    if schedule is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Schedule not found")
    db.delete(schedule)
    db.commit()
