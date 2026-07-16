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
from app.models import Attendance, Enrollment, User, UserRole
from app.schemas.attendance import AttendanceCreate, AttendanceRead, AttendanceUpdate

router = APIRouter(prefix="/attendance", tags=["attendance"])

staff_only = require_role(UserRole.admin, UserRole.teacher)


def _ensure_teacher_owns_enrollment(
    db: Session, user: User, enrollment: Enrollment
) -> None:
    """Teachers may only manage attendance for courses they teach."""
    if user.role == UserRole.teacher and not teacher_teaches_course(
        db, user.id, enrollment.course_id
    ):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "No enseñas este curso",
        )


@router.get("", response_model=list[AttendanceRead])
def list_attendance(
    enrollment_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[Attendance]:
    stmt = select(Attendance)
    if enrollment_id is not None:
        stmt = stmt.where(Attendance.enrollment_id == enrollment_id)
    # Students only see their own attendance.
    if current_user.role == UserRole.student:
        stmt = stmt.join(Enrollment).where(Enrollment.student_id == current_user.id)
    # Teachers only see attendance for their own courses.
    elif current_user.role == UserRole.teacher:
        course_ids = teacher_course_ids(db, current_user.id)
        stmt = stmt.join(Enrollment).where(Enrollment.course_id.in_(course_ids or [-1]))
    return list(db.scalars(stmt).all())


@router.post("", response_model=AttendanceRead, status_code=status.HTTP_201_CREATED)
def create_attendance(
    payload: AttendanceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(staff_only),
) -> Attendance:
    enrollment = db.get(Enrollment, payload.enrollment_id)
    if enrollment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Enrollment not found")
    _ensure_teacher_owns_enrollment(db, current_user, enrollment)
    record = Attendance(**payload.model_dump())
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


@router.patch("/{attendance_id}", response_model=AttendanceRead)
def update_attendance(
    attendance_id: int,
    payload: AttendanceUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(staff_only),
) -> Attendance:
    record = db.get(Attendance, attendance_id)
    if record is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Attendance record not found")
    _ensure_teacher_owns_enrollment(db, current_user, record.enrollment)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(record, field, value)
    db.commit()
    db.refresh(record)
    return record


@router.delete("/{attendance_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_attendance(
    attendance_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(staff_only),
) -> None:
    record = db.get(Attendance, attendance_id)
    if record is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Attendance record not found")
    _ensure_teacher_owns_enrollment(db, current_user, record.enrollment)
    db.delete(record)
    db.commit()
