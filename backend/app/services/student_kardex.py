from __future__ import annotations

from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    Attendance,
    ATTENDANCE_COUNTS_TOWARD_RATE,
    ATTENDANCE_IS_PRESENT,
    Course,
    ENROLLMENT_OCCUPIES_SEAT,
    ENROLLMENT_OWES,
    ENROLLMENT_STATUS_LABELS,
    Enrollment,
    EnrollmentStatus,
    Grade,
    Level,
    Nationality,
    PaymentStatus,
    User,
)
from app.schemas.kardex import (
    KardexCourseEntry,
    KardexSummary,
    StudentKardexResponse,
)
from app.services.enrollments import attach_balances


def get_student_kardex(db: Session, student_id: int) -> StudentKardexResponse:
    student = db.get(User, student_id)
    if student is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Estudiante no encontrado"
        )

    # Fetch nationality name if present
    nationality_name = None
    if student.nationality_id:
        nat = db.get(Nationality, student.nationality_id)
        if nat:
            nationality_name = nat.name

    # Fetch all enrollments for student
    enrollments = list(
        db.scalars(
            select(Enrollment)
            .where(Enrollment.student_id == student_id)
            # `Enrollment` carries no timestamp of its own, so the newest-first
            # order comes from the serial key, which *is* the order they were
            # created in. This used to read `Enrollment.created_at`, a column
            # that does not exist: the endpoint raised AttributeError before
            # returning a single expediente.
            .order_by(Enrollment.id.desc())
        ).all()
    )

    attach_balances(db, enrollments)

    history: list[KardexCourseEntry] = []
    total_passed = 0
    total_failed = 0
    scores: list[float] = []
    total_balance = Decimal("0.00")
    all_skills_acc: dict[str, list[float]] = {}

    for en in enrollments:
        course = db.get(Course, en.course_id)
        level = db.get(Level, course.level_id) if course else None

        # Compute course grade / evaluation score
        from app.services.grading import compute_final_grade
        grade_res = compute_final_grade(db, en)
        final_score = grade_res.final_score
        passed = grade_res.passed if final_score is not None else None
        if passed:
            total_passed += 1
        elif passed is False:
            total_failed += 1

        if final_score is not None:
            scores.append(final_score)
        elif en.status == EnrollmentStatus.graduated:
            total_passed += 1

        bal = getattr(en, "balance", None) or Decimal("0.00")
        total_balance += bal

        course_skills_acc: dict[str, list[float]] = {}
        for c in grade_res.components:
            if c.skill:
                course_skills_acc.setdefault(c.skill, []).append(c.score)
                all_skills_acc.setdefault(c.skill, []).append(c.score)
        course_skills = {
            s: round(sum(vals) / len(vals), 1)
            for s, vals in sorted(course_skills_acc.items())
        }

        history.append(
            KardexCourseEntry(
                enrollment_id=en.id,
                course_id=en.course_id,
                course_title=course.name if course else f"Curso #{en.course_id}",
                level_name=level.name if level else "Nivel General",
                status=en.status.value,
                status_label=ENROLLMENT_STATUS_LABELS.get(en.status, en.status.value),
                enrollment_code=en.enrollment_code,
                final_score=final_score,
                passed=passed,
                balance=bal,
                skills=course_skills,
            )
        )

    # Compute overall attendance rate.
    counted_records = db.scalar(
        select(func.count(Attendance.id))
        .join(Enrollment, Attendance.enrollment_id == Enrollment.id)
        .where(
            Enrollment.student_id == student_id,
            Attendance.status.in_(ATTENDANCE_COUNTS_TOWARD_RATE),
        )
    ) or 0

    attended_records = db.scalar(
        select(func.count(Attendance.id))
        .join(Enrollment, Attendance.enrollment_id == Enrollment.id)
        .where(
            Enrollment.student_id == student_id,
            Attendance.status.in_(ATTENDANCE_IS_PRESENT),
        )
    ) or 0

    attendance_rate = (
        round((attended_records / counted_records) * 100, 1)
        if counted_records > 0
        else 100.0
    )

    # Person operational status calculation
    active_enrollments = [en for en in enrollments if en.status in ENROLLMENT_OCCUPIES_SEAT]
    has_overdue = any(
        en.payment_status == PaymentStatus.overdue
        for en in enrollments
        if en.status in ENROLLMENT_OWES
    )
    if total_balance > 0 and has_overdue:
        person_status = "delinquent"
        person_status_label = "En Mora"
    elif active_enrollments:
        person_status = "active"
        person_status_label = "Activo"
    elif any(en.status == EnrollmentStatus.inactive for en in enrollments):
        person_status = "paused"
        person_status_label = "En Pausa"
    elif any(en.status == EnrollmentStatus.graduated for en in enrollments):
        person_status = "graduated"
        person_status_label = "Egresado"
    else:
        person_status = "prospect"
        person_status_label = "Prospecto / Sin Curso"

    global_gpa = round(sum(scores) / len(scores), 2) if scores else 0.0
    global_skills = {
        s: round(sum(vals) / len(vals), 1)
        for s, vals in sorted(all_skills_acc.items())
    }

    summary = KardexSummary(
        global_gpa=global_gpa,
        overall_attendance_rate=attendance_rate,
        total_courses_passed=total_passed,
        total_courses_failed=total_failed,
        person_status=person_status,
        person_status_label=person_status_label,
        outstanding_balance=total_balance,
        skills_breakdown=global_skills,
    )

    return StudentKardexResponse(
        student_id=student.id,
        student_name=student.full_name,
        student_email=student.email,
        phone=student.phone,
        nationality=nationality_name,
        summary=summary,
        history=history,
    )
