from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user, require_role, teacher_teaches_course
from app.models import Course, Enrollment, Language, Level, Schedule, User, UserRole
from app.schemas.catalog import (
    CourseCreate,
    CourseRead,
    CourseUpdate,
    LanguageCreate,
    LanguageRead,
    LanguageUpdate,
    LevelCreate,
    LevelRead,
    LevelUpdate,
)
from app.schemas.user import UserBrief

router = APIRouter(prefix="/catalog", tags=["catalog"])

admin_only = require_role(UserRole.admin)
staff_only = require_role(UserRole.admin, UserRole.teacher)


# ---------------- Languages ----------------
@router.get("/languages", response_model=list[LanguageRead])
def list_languages(
    db: Session = Depends(get_db), _: User = Depends(get_current_user)
) -> list[Language]:
    return list(db.scalars(select(Language)).all())


@router.post(
    "/languages", response_model=LanguageRead, status_code=status.HTTP_201_CREATED
)
def create_language(
    payload: LanguageCreate,
    db: Session = Depends(get_db),
    _: User = Depends(admin_only),
) -> Language:
    lang = Language(name=payload.name)
    db.add(lang)
    db.commit()
    db.refresh(lang)
    return lang


@router.patch("/languages/{language_id}", response_model=LanguageRead)
def update_language(
    language_id: int,
    payload: LanguageUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(admin_only),
) -> Language:
    lang = db.get(Language, language_id)
    if lang is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Language not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(lang, field, value)
    db.commit()
    db.refresh(lang)
    return lang


@router.delete("/languages/{language_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_language(
    language_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(admin_only),
) -> None:
    lang = db.get(Language, language_id)
    if lang is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Language not found")
    db.delete(lang)
    db.commit()


# ---------------- Levels ----------------
@router.get("/levels", response_model=list[LevelRead])
def list_levels(
    language_id: int | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[Level]:
    stmt = select(Level)
    if language_id is not None:
        stmt = stmt.where(Level.language_id == language_id)
    return list(db.scalars(stmt).all())


@router.post("/levels", response_model=LevelRead, status_code=status.HTTP_201_CREATED)
def create_level(
    payload: LevelCreate,
    db: Session = Depends(get_db),
    _: User = Depends(admin_only),
) -> Level:
    if db.get(Language, payload.language_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Language not found")
    level = Level(**payload.model_dump())
    db.add(level)
    db.commit()
    db.refresh(level)
    return level


@router.patch("/levels/{level_id}", response_model=LevelRead)
def update_level(
    level_id: int,
    payload: LevelUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(admin_only),
) -> Level:
    level = db.get(Level, level_id)
    if level is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Level not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(level, field, value)
    db.commit()
    db.refresh(level)
    return level


@router.delete("/levels/{level_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_level(
    level_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(admin_only),
) -> None:
    level = db.get(Level, level_id)
    if level is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Level not found")
    db.delete(level)
    db.commit()


# ---------------- Courses ----------------
@router.get("/courses", response_model=list[CourseRead])
def list_courses(
    level_id: int | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[Course]:
    stmt = select(Course)
    if level_id is not None:
        stmt = stmt.where(Course.level_id == level_id)
    return list(db.scalars(stmt).all())


@router.post("/courses", response_model=CourseRead, status_code=status.HTTP_201_CREATED)
def create_course(
    payload: CourseCreate,
    db: Session = Depends(get_db),
    _: User = Depends(admin_only),
) -> Course:
    if db.get(Level, payload.level_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Level not found")
    course = Course(**payload.model_dump())
    db.add(course)
    db.commit()
    db.refresh(course)
    return course


@router.patch("/courses/{course_id}", response_model=CourseRead)
def update_course(
    course_id: int,
    payload: CourseUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(admin_only),
) -> Course:
    course = db.get(Course, course_id)
    if course is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Course not found")
    data = payload.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(course, field, value)
    # Keep the denormalized term on this course's schedules in sync so conflict
    # detection stays correct when a course's dates change.
    if "start_date" in data or "end_date" in data:
        for sched in db.scalars(
            select(Schedule).where(Schedule.course_id == course_id)
        ).all():
            sched.term_start = course.start_date
            sched.term_end = course.end_date
    db.commit()
    db.refresh(course)
    return course


@router.get("/courses/{course_id}/students", response_model=list[UserBrief])
def list_course_students(
    course_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(staff_only),
) -> list[User]:
    """Roster of a course, so a teacher can put names next to enrollment rows.

    Scoped on purpose: teachers get the students of the courses they teach and
    nothing else.
    """
    if db.get(Course, course_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Course not found")
    if current_user.role == UserRole.teacher and not teacher_teaches_course(
        db, current_user.id, course_id
    ):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No enseñas este curso")
    return list(
        db.scalars(
            select(User)
            .join(Enrollment, Enrollment.student_id == User.id)
            .where(Enrollment.course_id == course_id)
            .order_by(User.full_name)
        ).all()
    )


@router.delete("/courses/{course_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_course(
    course_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(admin_only),
) -> None:
    course = db.get(Course, course_id)
    if course is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Course not found")
    db.delete(course)
    db.commit()
