from __future__ import annotations

from datetime import date
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import apply_tenant
from app.models import ClassSession, Course, Schedule, SessionStatus, User, UserRole
from app.schemas.teacher_payroll import (
    AcademyPayrollSummary,
    TeacherPayrollReport,
    TeacherPayrollSessionItem,
    TeacherPayrollSummary,
)


def _session_duration_hours(session: ClassSession) -> float:
    """Calculate session duration in decimal hours."""
    start_minutes = session.start_time.hour * 60 + session.start_time.minute
    end_minutes = session.end_time.hour * 60 + session.end_time.minute
    diff = max(0, end_minutes - start_minutes)
    return round(diff / 60.0, 2)


def calculate_teacher_payroll(
    db: Session,
    teacher: User,
    date_from: date,
    date_to: date,
) -> TeacherPayrollReport:
    """Calculate detailed teaching hours and remuneration for a single teacher in a date window."""
    rate = teacher.hourly_rate or 0.0

    stmt = (
        select(ClassSession, Course)
        .join(Schedule, ClassSession.schedule_id == Schedule.id)
        .join(Course, Schedule.course_id == Course.id)
        .where(
            ClassSession.teacher_id == teacher.id,
            ClassSession.date >= date_from,
            ClassSession.date <= date_to,
            ClassSession.status != SessionStatus.cancelled,
            (ClassSession.status == SessionStatus.held) | (ClassSession.register_closed_at.isnot(None)),
        )
        .order_by(ClassSession.date.asc(), ClassSession.start_time.asc())
    )

    rows = db.execute(stmt).all()
    session_items: list[TeacherPayrollSessionItem] = []
    total_hours = 0.0
    total_amount = 0.0

    for session, course in rows:
        duration = _session_duration_hours(session)
        amount = round(duration * rate, 2)
        total_hours += duration
        total_amount += amount

        session_items.append(
            TeacherPayrollSessionItem(
                session_id=session.id,
                course_id=course.id,
                course_name=course.name,
                date=session.date,
                start_time=session.start_time,
                end_time=session.end_time,
                duration_hours=duration,
                status=session.status.value,
                register_closed=session.register_closed_at is not None,
                hourly_rate=rate,
                amount=amount,
            )
        )

    return TeacherPayrollReport(
        teacher_id=teacher.id,
        teacher_name=teacher.full_name,
        email=teacher.email,
        hourly_rate=rate,
        date_from=date_from,
        date_to=date_to,
        total_sessions=len(session_items),
        total_hours=round(total_hours, 2),
        total_amount=round(total_amount, 2),
        sessions=session_items,
    )


def calculate_academy_payroll(
    db: Session,
    current_user: User,
    date_from: date,
    date_to: date,
) -> AcademyPayrollSummary:
    """Calculate consolidated payroll for all active teachers in the tenant."""
    stmt = apply_tenant(
        select(User).where(
            User.role == UserRole.teacher,
            User.is_active == True,
        ).order_by(User.full_name.asc()),
        User.tenant_id,
        current_user,
    )
    teachers = db.scalars(stmt).all()

    teacher_summaries: list[TeacherPayrollSummary] = []
    total_academy_hours = 0.0
    total_academy_amount = 0.0

    for teacher in teachers:
        report = calculate_teacher_payroll(db, teacher, date_from, date_to)
        total_academy_hours += report.total_hours
        total_academy_amount += report.total_amount

        teacher_summaries.append(
            TeacherPayrollSummary(
                teacher_id=teacher.id,
                teacher_name=teacher.full_name,
                email=teacher.email,
                hourly_rate=report.hourly_rate,
                total_sessions=report.total_sessions,
                total_hours=report.total_hours,
                total_amount=report.total_amount,
            )
        )

    return AcademyPayrollSummary(
        date_from=date_from,
        date_to=date_to,
        total_teachers=len(teacher_summaries),
        total_hours=round(total_academy_hours, 2),
        total_amount=round(total_academy_amount, 2),
        teachers=teacher_summaries,
    )
