"""Course evaluation weights and final grades."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import (
    course_in_scope_or_404,
    get_current_user,
    in_tenant,
    require_permission,
    require_staff_permission,
    student_is_solvent,
    teacher_teaches_course,
)
from app.models import (
    Course,
    CourseEvaluation,
    Enrollment,
    Level,
    PaymentStatus,
    Permission,
    User,
    UserRole,
)
from app.schemas.grading import (
    ComponentRead,
    CourseEvaluationCreate,
    CourseEvaluationRead,
    FinalGradeRead,
)
from app.services.grading import compute_final_grade

router = APIRouter(tags=["grading"])

admin_only = require_permission(Permission.manage_grades)
staff_only = require_staff_permission(Permission.manage_grades)


# ---------------- Evaluation weights (per course) ----------------
@router.get(
    "/catalog/courses/{course_id}/evaluations",
    response_model=list[CourseEvaluationRead],
)
def list_evaluations(
    course_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(staff_only),
) -> list[CourseEvaluation]:
    course_in_scope_or_404(db, current_user, course_id)
    return list(
        db.scalars(
            select(CourseEvaluation).where(CourseEvaluation.course_id == course_id)
        ).all()
    )


@router.post(
    "/catalog/courses/{course_id}/evaluations",
    response_model=CourseEvaluationRead,
    status_code=status.HTTP_201_CREATED,
)
def add_evaluation(
    course_id: int,
    payload: CourseEvaluationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(admin_only),
) -> CourseEvaluation:
    course_in_scope_or_404(db, current_user, course_id)
    ev = CourseEvaluation(
        course_id=course_id,
        name=payload.name,
        weight=payload.weight,
        skill=payload.skill.value if payload.skill else None,
    )
    db.add(ev)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Esa evaluación ya existe")
    db.refresh(ev)
    return ev


@router.delete(
    "/catalog/courses/{course_id}/evaluations/{evaluation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_evaluation(
    course_id: int,
    evaluation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(admin_only),
) -> None:
    course_in_scope_or_404(db, current_user, course_id)
    ev = db.get(CourseEvaluation, evaluation_id)
    if ev is None or ev.course_id != course_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Evaluation not found")
    db.delete(ev)
    db.commit()


# ---------------- Final grade ----------------
def _visible_enrollment(db: Session, user: User, enrollment_id: int) -> Enrollment:
    enrollment = db.get(Enrollment, enrollment_id)
    # Reached through its course, which is what carries the academy.
    if enrollment is not None and not in_tenant(
        user, db.get(Course, enrollment.course_id)
    ):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Enrollment not found")
    if enrollment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Enrollment not found")
    if user.role == UserRole.student:
        if enrollment.student_id != user.id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Enrollment not found")
        if not student_is_solvent(db, user.id):
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                "Acceso restringido: Tienes pagos pendientes. Por favor regulariza tu saldo para consultar notas y certificados.",
            )
    if user.role == UserRole.teacher and not teacher_teaches_course(
        db, user.id, enrollment.course_id
    ):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Enrollment not found")
    return enrollment


@router.get("/enrollments/{enrollment_id}/final-grade", response_model=FinalGradeRead)
def get_final_grade(
    enrollment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> FinalGradeRead:
    """Weighted final grade of an enrolment, and whether it passes.

    Visible to the student (their own), the course's teacher, or an admin.
    """
    enrollment = _visible_enrollment(db, current_user, enrollment_id)
    result = compute_final_grade(db, enrollment)
    return FinalGradeRead(
        enrollment_id=enrollment.id,
        final_score=result.final_score,
        passing_score=result.passing_score,
        passed=result.passed,
        components=[ComponentRead.model_validate(c) for c in result.components],
    )
