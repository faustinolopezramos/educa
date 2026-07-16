from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user, require_role
from app.models import (
    Language,
    TeacherAvailability,
    TeacherLanguage,
    User,
    UserRole,
)
from app.schemas.teacher import (
    AvailabilityCreate,
    AvailabilityRead,
    AvailableTeacher,
    TeacherLanguageRead,
    TeacherLanguagesSet,
)

router = APIRouter(prefix="/teachers", tags=["teachers"])

admin_only = require_role(UserRole.admin)


@router.get("", response_model=list[AvailableTeacher])
def list_teachers(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[AvailableTeacher]:
    """Public (any authenticated user): teacher id + name, e.g. to label a class."""
    teachers = db.scalars(select(User).where(User.role == UserRole.teacher)).all()
    return [AvailableTeacher(id=t.id, full_name=t.full_name) for t in teachers]


def _require_teacher(db: Session, teacher_id: int) -> User:
    teacher = db.get(User, teacher_id)
    if teacher is None or teacher.role != UserRole.teacher:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Not a teacher")
    return teacher


# ---------------- Language qualifications ----------------
@router.get("/{teacher_id}/languages", response_model=list[TeacherLanguageRead])
def list_teacher_languages(
    teacher_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(admin_only),
) -> list[TeacherLanguage]:
    _require_teacher(db, teacher_id)
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
    _: User = Depends(admin_only),
) -> list[TeacherLanguage]:
    """Replace the teacher's full set of language qualifications."""
    _require_teacher(db, teacher_id)
    valid_ids = set(
        db.scalars(
            select(Language.id).where(Language.id.in_(payload.language_ids))
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
    for row in existing:
        db.delete(row)
    for lang_id in valid_ids:
        db.add(TeacherLanguage(teacher_id=teacher_id, language_id=lang_id))
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
    _: User = Depends(admin_only),
) -> list[TeacherAvailability]:
    _require_teacher(db, teacher_id)
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
    _: User = Depends(admin_only),
) -> TeacherAvailability:
    _require_teacher(db, teacher_id)
    window = TeacherAvailability(teacher_id=teacher_id, **payload.model_dump())
    db.add(window)
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
    _: User = Depends(admin_only),
) -> None:
    window = db.get(TeacherAvailability, availability_id)
    if window is None or window.teacher_id != teacher_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Availability not found")
    db.delete(window)
    db.commit()
