"""Course evaluation weights, final grades and level certificates."""

import secrets

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import (
    get_current_user,
    require_role,
    teacher_teaches_course,
)
from app.models import (
    Certificate,
    Course,
    CourseEvaluation,
    Enrollment,
    Level,
    User,
    UserRole,
)
from app.schemas.grading import (
    CertificateRead,
    ComponentRead,
    CourseEvaluationCreate,
    CourseEvaluationRead,
    FinalGradeRead,
)
from app.services.audit import record
from app.services.certificate_pdf import build_certificate_pdf
from app.services.grading import compute_final_grade

router = APIRouter(tags=["grading"])

admin_only = require_role(UserRole.admin)
staff_only = require_role(UserRole.admin, UserRole.teacher)


# ---------------- Evaluation weights (per course) ----------------
@router.get(
    "/catalog/courses/{course_id}/evaluations",
    response_model=list[CourseEvaluationRead],
)
def list_evaluations(
    course_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(staff_only),
) -> list[CourseEvaluation]:
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
    _: User = Depends(admin_only),
) -> CourseEvaluation:
    if db.get(Course, course_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Course not found")
    ev = CourseEvaluation(course_id=course_id, name=payload.name, weight=payload.weight)
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
    _: User = Depends(admin_only),
) -> None:
    ev = db.get(CourseEvaluation, evaluation_id)
    if ev is None or ev.course_id != course_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Evaluation not found")
    db.delete(ev)
    db.commit()


# ---------------- Final grade ----------------
def _visible_enrollment(db: Session, user: User, enrollment_id: int) -> Enrollment:
    enrollment = db.get(Enrollment, enrollment_id)
    if enrollment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Enrollment not found")
    if user.role == UserRole.student and enrollment.student_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Enrollment not found")
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


# ---------------- Certificates ----------------
def _course_level(db: Session, course_id: int) -> Level:
    course = db.get(Course, course_id)
    return db.get(Level, course.level_id)


@router.post(
    "/enrollments/{enrollment_id}/certificate",
    response_model=CertificateRead,
    status_code=status.HTTP_201_CREATED,
)
def issue_certificate(
    enrollment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(admin_only),
) -> Certificate:
    """Issue a level certificate — only if the student has actually passed."""
    enrollment = db.get(Enrollment, enrollment_id)
    if enrollment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Enrollment not found")
    if db.scalar(
        select(Certificate).where(Certificate.enrollment_id == enrollment_id)
    ):
        raise HTTPException(status.HTTP_409_CONFLICT, "El certificado ya fue emitido")

    result = compute_final_grade(db, enrollment)
    if not result.passed:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            {
                "message": "El alumno no ha aprobado el curso",
                "reason": "not_passed",
            },
        )
    level = _course_level(db, enrollment.course_id)
    certificate = Certificate(
        enrollment_id=enrollment.id,
        level_id=level.id,
        final_score=result.final_score,
        code="EDUCA-" + secrets.token_hex(5).upper(),
        issued_by=current_user.id,
    )
    db.add(certificate)
    record(db, current_user, "create", "certificate", enrollment.id)
    db.commit()
    db.refresh(certificate)
    return certificate


@router.get(
    "/enrollments/{enrollment_id}/certificate", response_model=CertificateRead | None
)
def enrollment_certificate(
    enrollment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Certificate | None:
    """The certificate of an enrolment, or null if none issued yet.

    Visible to the student (their own), the course's teacher, or an admin.
    """
    enrollment = _visible_enrollment(db, current_user, enrollment_id)
    return db.scalar(
        select(Certificate).where(Certificate.enrollment_id == enrollment.id)
    )


@router.get("/certificates/{code}", response_model=CertificateRead)
def verify_certificate(
    code: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> Certificate:
    """Look up a certificate by its code (verification)."""
    certificate = db.scalar(select(Certificate).where(Certificate.code == code))
    if certificate is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Certificate not found")
    return certificate


@router.get("/certificates/{certificate_id}/pdf")
def certificate_pdf(
    certificate_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> StreamingResponse:
    """The certificate as a print-ready PDF. Owner student or staff only."""
    certificate = db.get(Certificate, certificate_id)
    if certificate is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Certificate not found")
    enrollment = db.get(Enrollment, certificate.enrollment_id)
    if current_user.role == UserRole.student and enrollment.student_id != current_user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Certificate not found")

    course = db.get(Course, enrollment.course_id)
    level = db.get(Level, certificate.level_id)
    student = db.get(User, enrollment.student_id)
    pdf = build_certificate_pdf(
        student_name=student.full_name,
        course_name=course.name,
        level_label=f"{level.code} — {level.name}",
        final_score=certificate.final_score,
        code=certificate.code,
        issued_at=certificate.issued_at,
    )
    return StreamingResponse(
        iter([pdf]),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="certificado_{certificate.code}.pdf"'
        },
    )
