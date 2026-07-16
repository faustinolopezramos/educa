from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import (
    get_current_user,
    require_role,
    teacher_course_ids,
    teacher_teaches_course,
)
from app.models import Enrollment, Grade, User, UserRole
from app.schemas.grade import GradeCreate, GradeRead, GradeUpdate

router = APIRouter(prefix="/grades", tags=["grades"])

staff_only = require_role(UserRole.admin, UserRole.teacher)


def _ensure_teacher_owns_enrollment(
    db: Session, user: User, enrollment: Enrollment
) -> None:
    """Teachers may only grade courses they teach."""
    if user.role == UserRole.teacher and not teacher_teaches_course(
        db, user.id, enrollment.course_id
    ):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No enseñas este curso")


@router.get("", response_model=list[GradeRead])
def list_grades(
    enrollment_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[Grade]:
    stmt = select(Grade)
    if enrollment_id is not None:
        stmt = stmt.where(Grade.enrollment_id == enrollment_id)
    # Students only see their own grades.
    if current_user.role == UserRole.student:
        stmt = stmt.join(Enrollment).where(Enrollment.student_id == current_user.id)
    # Teachers only see grades for their own courses.
    elif current_user.role == UserRole.teacher:
        course_ids = teacher_course_ids(db, current_user.id)
        stmt = stmt.join(Enrollment).where(Enrollment.course_id.in_(course_ids or [-1]))
    return list(db.scalars(stmt).all())


@router.post("", response_model=GradeRead, status_code=status.HTTP_201_CREATED)
def create_grade(
    payload: GradeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(staff_only),
) -> Grade:
    enrollment = db.get(Enrollment, payload.enrollment_id)
    if enrollment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Enrollment not found")
    _ensure_teacher_owns_enrollment(db, current_user, enrollment)
    grade = Grade(**payload.model_dump())
    db.add(grade)
    db.commit()
    db.refresh(grade)
    return grade


@router.patch("/{grade_id}", response_model=GradeRead)
def update_grade(
    grade_id: int,
    payload: GradeUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(staff_only),
) -> Grade:
    grade = db.get(Grade, grade_id)
    if grade is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Grade not found")
    _ensure_teacher_owns_enrollment(db, current_user, grade.enrollment)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(grade, field, value)
    db.commit()
    db.refresh(grade)
    return grade


@router.delete("/{grade_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_grade(
    grade_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(staff_only),
) -> None:
    grade = db.get(Grade, grade_id)
    if grade is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Grade not found")
    _ensure_teacher_owns_enrollment(db, current_user, grade.enrollment)
    db.delete(grade)
    db.commit()
