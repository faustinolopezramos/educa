"""Read-only aggregation of a period's sessions, attendance and grades.

Everything here is derived from `ClassSession` and the rows that hang off it, so
a report is just "the sessions whose date falls in [from, to], scoped to what
the caller may see". No new state, no writes.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from app.core.deps import student_course_ids, teacher_course_ids
from app.models import (
    Attendance,
    AttendanceStatus,
    ClassSession,
    Course,
    Enrollment,
    Grade,
    Schedule,
    SessionStatus,
    User,
    UserRole,
)

# A student is flagged when they miss more than this share of classes, or their
# session-grade average drops below a passing mark.
MIN_ATTENDANCE_RATE = 0.7
PASSING_AVERAGE = 6.0


def period_range(period: str, anchor: date) -> tuple[date, date]:
    """The [from, to] the period covers around the anchor date."""
    if period == "day":
        return anchor, anchor
    if period == "week":  # Monday..Sunday
        start = anchor - timedelta(days=anchor.weekday())
        return start, start + timedelta(days=6)
    if period == "month":
        start = anchor.replace(day=1)
        nxt = (
            start.replace(year=start.year + 1, month=1)
            if start.month == 12
            else start.replace(month=start.month + 1)
        )
        return start, nxt - timedelta(days=1)
    raise ValueError("period must be one of: day, week, month")


def scoped_course_ids(
    db: DbSession,
    user: User,
    course_id: int | None,
    teacher_id: int | None,
) -> list[int]:
    """Courses the caller may report on, narrowed by the optional filters.

    Filters can only ever narrow the caller's own scope — never widen it.
    """
    if user.role == UserRole.admin:
        allowed = list(db.scalars(select(Course.id)).all())
    elif user.role == UserRole.teacher:
        allowed = teacher_course_ids(db, user.id)
    else:
        allowed = student_course_ids(db, user.id)
    allowed_set = set(allowed)
    if teacher_id is not None:
        allowed_set &= set(teacher_course_ids(db, teacher_id))
    if course_id is not None:
        allowed_set &= {course_id}
    return list(allowed_set)


@dataclass
class CourseAttendance:
    course_id: int
    course_name: str
    present: int
    total: int
    rate: float | None


@dataclass
class AtRiskStudent:
    student_id: int
    student_name: str
    course_id: int
    course_name: str
    attendance_rate: float | None
    average: float | None
    reasons: list[str]


@dataclass
class Report:
    period: str
    date_from: date
    date_to: date
    sessions_total: int = 0
    sessions_held: int = 0
    sessions_cancelled: int = 0
    attendance_rate: float | None = None
    attendance_by_course: list[CourseAttendance] = field(default_factory=list)
    grades_recorded: int = 0
    grade_average: float | None = None
    at_risk: list[AtRiskStudent] = field(default_factory=list)


def build_report(
    db: DbSession,
    user: User,
    period: str,
    anchor: date,
    course_id: int | None = None,
    teacher_id: int | None = None,
) -> Report:
    date_from, date_to = period_range(period, anchor)
    course_ids = scoped_course_ids(db, user, course_id, teacher_id)
    report = Report(period=period, date_from=date_from, date_to=date_to)
    if not course_ids:
        return report

    # A student only ever sees their own enrolment data within those courses.
    own_student_id = user.id if user.role == UserRole.student else None

    course_name = {
        c.id: c.name
        for c in db.scalars(select(Course).where(Course.id.in_(course_ids))).all()
    }

    # --- Sessions in range ---
    sessions = db.scalars(
        select(ClassSession)
        .join(Schedule)
        .where(
            Schedule.course_id.in_(course_ids),
            ClassSession.date >= date_from,
            ClassSession.date <= date_to,
        )
    ).all()
    report.sessions_total = len(sessions)
    report.sessions_cancelled = sum(
        1 for s in sessions if s.status == SessionStatus.cancelled
    )
    # "Held" = the classes that actually took place, i.e. everything not
    # cancelled. Nothing flips a session to an explicit "held" status, so a
    # cancelled class is the only thing that reduces the count.
    report.sessions_held = report.sessions_total - report.sessions_cancelled

    # --- Attendance in range ---
    att_rows = db.execute(
        select(Attendance, Enrollment.course_id, Enrollment.student_id)
        .join(ClassSession, Attendance.session_id == ClassSession.id)
        .join(Enrollment, Attendance.enrollment_id == Enrollment.id)
        .join(Schedule, ClassSession.schedule_id == Schedule.id)
        .where(
            Schedule.course_id.in_(course_ids),
            ClassSession.date >= date_from,
            ClassSession.date <= date_to,
            *([Enrollment.student_id == own_student_id] if own_student_id else []),
        )
    ).all()

    present_total = 0
    per_course: dict[int, list[int]] = {}  # course_id -> [present, total]
    # (student, course) -> [present, total] for the at-risk pass
    per_student: dict[tuple[int, int], list[int]] = {}
    attended = {AttendanceStatus.present, AttendanceStatus.late}
    for att, cid, sid in att_rows:
        is_present = att.status in attended
        present_total += 1 if is_present else 0
        pc = per_course.setdefault(cid, [0, 0])
        pc[0] += 1 if is_present else 0
        pc[1] += 1
        ps = per_student.setdefault((sid, cid), [0, 0])
        ps[0] += 1 if is_present else 0
        ps[1] += 1

    total_marks = len(att_rows)
    report.attendance_rate = (
        round(present_total / total_marks, 3) if total_marks else None
    )
    report.attendance_by_course = [
        CourseAttendance(
            course_id=cid,
            course_name=course_name.get(cid, f"#{cid}"),
            present=p,
            total=t,
            rate=round(p / t, 3) if t else None,
        )
        for cid, (p, t) in sorted(per_course.items())
    ]

    # --- Session grades in range ---
    grade_rows = db.execute(
        select(Grade, Enrollment.course_id, Enrollment.student_id)
        .join(ClassSession, Grade.session_id == ClassSession.id)
        .join(Enrollment, Grade.enrollment_id == Enrollment.id)
        .join(Schedule, ClassSession.schedule_id == Schedule.id)
        .where(
            Schedule.course_id.in_(course_ids),
            ClassSession.date >= date_from,
            ClassSession.date <= date_to,
            *([Enrollment.student_id == own_student_id] if own_student_id else []),
        )
    ).all()
    report.grades_recorded = len(grade_rows)
    if grade_rows:
        report.grade_average = round(
            sum(g.score for g, _, _ in grade_rows) / len(grade_rows), 2
        )

    # student average per course over the range (session grades)
    avg_acc: dict[tuple[int, int], list[float]] = {}
    for g, cid, sid in grade_rows:
        avg_acc.setdefault((sid, cid), []).append(g.score)

    # --- At-risk pass ---
    student_name = {
        u.id: u.full_name
        for u in db.scalars(
            select(User).where(
                User.id.in_([sid for (sid, _cid) in per_student] or [-1])
            )
        ).all()
    }
    for (sid, cid), (present, total) in per_student.items():
        rate = present / total if total else None
        scores = avg_acc.get((sid, cid))
        average = round(sum(scores) / len(scores), 2) if scores else None
        reasons: list[str] = []
        if rate is not None and rate < MIN_ATTENDANCE_RATE:
            reasons.append("asistencia baja")
        if average is not None and average < PASSING_AVERAGE:
            reasons.append("promedio bajo")
        if reasons:
            report.at_risk.append(
                AtRiskStudent(
                    student_id=sid,
                    student_name=student_name.get(sid, f"#{sid}"),
                    course_id=cid,
                    course_name=course_name.get(cid, f"#{cid}"),
                    attendance_rate=round(rate, 3) if rate is not None else None,
                    average=average,
                    reasons=reasons,
                )
            )
    report.at_risk.sort(key=lambda r: (r.attendance_rate or 0, r.average or 0))
    return report
