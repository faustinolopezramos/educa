from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user, require_role, teacher_course_ids
from app.models import Course, Enrollment, EnrollmentStatus, User, UserRole
from app.schemas.enrollment import EnrollmentCreate, EnrollmentRead, EnrollmentUpdate
from app.services.audit import record, snapshot
from app.services.scheduling import student_schedule_conflicts

router = APIRouter(prefix="/enrollments", tags=["enrollments"])

admin_only = require_role(UserRole.admin)


@router.get("", response_model=list[EnrollmentRead])
def list_enrollments(
    course_id: int | None = None,
    student_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[Enrollment]:
    stmt = select(Enrollment)
    # Students may only see their own enrollments.
    if current_user.role == UserRole.student:
        stmt = stmt.where(Enrollment.student_id == current_user.id)
    else:
        # Teachers only see enrollments of the courses they teach.
        if current_user.role == UserRole.teacher:
            taught = teacher_course_ids(db, current_user.id)
            stmt = stmt.where(Enrollment.course_id.in_(taught or [-1]))
        if student_id is not None:
            stmt = stmt.where(Enrollment.student_id == student_id)
    if course_id is not None:
        stmt = stmt.where(Enrollment.course_id == course_id)
    return list(db.scalars(stmt).all())


@router.post("", response_model=EnrollmentRead, status_code=status.HTTP_201_CREATED)
def create_enrollment(
    payload: EnrollmentCreate,
    force: bool = False,
    db: Session = Depends(get_db),
    _: User = Depends(admin_only),
) -> Enrollment:
    student = db.get(User, payload.student_id)
    if student is None or student.role != UserRole.student:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "student_id must be a student")

    # Lock the course row so concurrent enrollments cannot exceed max_students.
    course = db.scalar(
        select(Course).where(Course.id == payload.course_id).with_for_update()
    )
    if course is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Course not found")

    if db.scalar(
        select(Enrollment).where(
            Enrollment.student_id == payload.student_id,
            Enrollment.course_id == payload.course_id,
        )
    ):
        raise HTTPException(status.HTTP_409_CONFLICT, "Student already enrolled")

    # Capacity check (active enrollments only).
    active_count = (
        db.scalar(
            select(func.count())
            .select_from(Enrollment)
            .where(
                Enrollment.course_id == payload.course_id,
                Enrollment.status == EnrollmentStatus.active,
            )
        )
        or 0
    )
    if active_count >= course.max_students:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": f"Cupo lleno ({active_count}/{course.max_students})",
                "reason": "capacity",
            },
        )

    # Student timetable clash (unless an admin forces it).
    if not force:
        clashes = student_schedule_conflicts(
            db, student_id=payload.student_id, course_id=payload.course_id
        )
        if clashes:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "message": "El horario del alumno choca con otra clase suya",
                    "reason": "student_schedule",
                    "conflicts": [
                        {
                            "schedule_id": s.id,
                            "course_id": s.course_id,
                            "day_of_week": s.day_of_week,
                            "start_time": s.start_time.isoformat(),
                            "end_time": s.end_time.isoformat(),
                        }
                        for s in clashes
                    ],
                },
            )

    enrollment = Enrollment(**payload.model_dump())
    db.add(enrollment)
    db.commit()
    db.refresh(enrollment)
    return enrollment


@router.patch("/{enrollment_id}", response_model=EnrollmentRead)
def update_enrollment(
    enrollment_id: int,
    payload: EnrollmentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(admin_only),
) -> Enrollment:
    enrollment = db.get(Enrollment, enrollment_id)
    if enrollment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Enrollment not found")
    before = snapshot(enrollment)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(enrollment, field, value)
    record(db, current_user, "update", "enrollment", enrollment.id, before, snapshot(enrollment))
    db.commit()
    db.refresh(enrollment)
    return enrollment


@router.delete("/{enrollment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_enrollment(
    enrollment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(admin_only),
) -> None:
    enrollment = db.get(Enrollment, enrollment_id)
    if enrollment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Enrollment not found")
    record(db, current_user, "delete", "enrollment", enrollment.id, before=snapshot(enrollment))
    db.delete(enrollment)
    db.commit()
