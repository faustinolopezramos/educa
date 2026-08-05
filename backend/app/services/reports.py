"""Read-only aggregation of a period's sessions, attendance and grades.

Everything here is derived from `ClassSession` and the rows that hang off it, so
a report is just "the sessions whose date falls in [from, to], scoped to what
the caller may see". No new state, no writes.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.orm import Session as DbSession

from app.core.config import settings
from app.core.deps import (
    is_admin,
    student_course_ids,
    teacher_course_ids,
    tenant_course_ids,
)
from app.models import (
    Assignment,
    AssignmentSubmission,
    Attendance,
    ATTENDANCE_COUNTS_TOWARD_RATE,
    ATTENDANCE_IS_PRESENT,
    ClassSession,
    Course,
    Enrollment,
    ENROLLMENT_OCCUPIES_SEAT,
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
    if is_admin(user) or user.role == UserRole.assistant:
        # Every course *of their own academy* — an admin reports on the whole
        # school, not on the whole installation. An assistant who got this far
        # holds `view_reports`, which is the same school-wide view: they had no
        # branch of their own before and fell through to the student one, so the
        # report came back empty with nothing to explain why.
        allowed = tenant_course_ids(db, user)
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
class ConsolidatedStudent:
    student_id: int
    student_name: str
    course_id: int
    course_name: str
    # `None` means "no data for this component", which is not the same as a
    # zero and must never be rendered as one.
    assignments_avg: float | None
    assignments_completion_rate: float | None
    exams_avg: float | None
    attendance_rate: float | None
    consolidated_score: float | None
    performance_status: str


@dataclass
class Report:
    period: str
    date_from: date
    date_to: date
    sessions_total: int = 0
    sessions_held: int = 0
    sessions_cancelled: int = 0
    # Neither taught nor called off: still upcoming, or past with no register.
    sessions_pending: int = 0
    attendance_rate: float | None = None
    attendance_by_course: list[CourseAttendance] = field(default_factory=list)
    grades_recorded: int = 0
    grade_average: float | None = None
    at_risk: list[AtRiskStudent] = field(default_factory=list)
    consolidated_students: list[ConsolidatedStudent] = field(default_factory=list)


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
    # "Realizada" es la sesión cuya lista el profesor dio por cerrada.
    #
    # Antes era `total − canceladas`, que contaba como impartida la clase del
    # viernes en un reporte sacado el lunes. Luego pasó a ser `status = held`,
    # que lo escribe el primer marcaje — mejor, pero una lista con 3 de 30
    # alumnos seguía figurando como registrada. El cierre explícito es la única
    # de las tres señales que alguien afirma a propósito.
    report.sessions_held = sum(1 for s in sessions if s.register_closed_at is not None)
    # What is left is neither taught nor called off: still to come if the date
    # has not passed, and never registered if it has.
    report.sessions_pending = (
        report.sessions_total - report.sessions_held - report.sessions_cancelled
    )

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
    counted_total = 0
    per_course: dict[int, list[int]] = {}  # course_id -> [present, counted]
    # (student, course) -> [present, counted] for the at-risk pass
    per_student: dict[tuple[int, int], list[int]] = {}
    for att, cid, sid in att_rows:
        # La justificada no entra por ningún lado: ni suma asistencia ni resta.
        # Ver `ATTENDANCE_COUNTS_TOWARD_RATE`.
        if att.status not in ATTENDANCE_COUNTS_TOWARD_RATE:
            continue
        is_present = att.status in ATTENDANCE_IS_PRESENT
        present_total += 1 if is_present else 0
        counted_total += 1
        pc = per_course.setdefault(cid, [0, 0])
        pc[0] += 1 if is_present else 0
        pc[1] += 1
        ps = per_student.setdefault((sid, cid), [0, 0])
        ps[0] += 1 if is_present else 0
        ps[1] += 1

    report.attendance_rate = (
        round(present_total / counted_total, 3) if counted_total else None
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

    # student average per course over the range (session grades + evaluation/exam grades)
    avg_acc: dict[tuple[int, int], list[float]] = {}
    for g, cid, sid in grade_rows:
        avg_acc.setdefault((sid, cid), []).append(g.score)

    # Bounds as instants in the academy's own timezone: `created_at` is stored
    # in UTC, and comparing its UTC *date* against a locally-computed one put
    # every grade entered after the local evening into the following day.
    tz = ZoneInfo(settings.academy_timezone)
    _period_start = datetime.combine(date_from, time.min, tzinfo=tz)
    _period_end = datetime.combine(date_to + timedelta(days=1), time.min, tzinfo=tz)

    # Course-level grades (exams, finals) belong to no session, so they are dated
    # by when they were entered. Without this bound a weekly report averaged in
    # every exam ever sat, and "en riesgo" stopped describing the period at all.
    eval_grade_rows = db.execute(
        select(Grade, Enrollment.course_id, Enrollment.student_id)
        .join(Enrollment, Grade.enrollment_id == Enrollment.id)
        .where(
            Enrollment.course_id.in_(course_ids),
            Grade.session_id.is_(None),
            Grade.created_at >= _period_start,
            Grade.created_at < _period_end,
            *([Enrollment.student_id == own_student_id] if own_student_id else []),
        )
    ).all()
    for g, cid, sid in eval_grade_rows:
        avg_acc.setdefault((sid, cid), []).append(g.score)

    # The headline average counts the same grades the at-risk rule does. While it
    # covered only session grades, a student could sit a failing exam and still
    # not move the number the report leads with — the metric and the warning
    # beside it were measuring different things.
    all_scores = [g.score for g, _, _ in grade_rows] + [
        g.score for g, _, _ in eval_grade_rows
    ]
    report.grades_recorded = len(all_scores)
    report.grade_average = (
        round(sum(all_scores) / len(all_scores), 2) if all_scores else None
    )

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

    # --- Consolidated 360° Academic Performance Pass ---
    active_enrollments = list(
        db.scalars(
            select(Enrollment).where(
                Enrollment.course_id.in_(course_ids or [-1]),
                Enrollment.status.in_(ENROLLMENT_OCCUPIES_SEAT),
                *([Enrollment.student_id == own_student_id] if own_student_id else []),
            )
        ).all()
    )

    all_assignments = list(
        db.scalars(
            select(Assignment).where(Assignment.course_id.in_(course_ids or [-1]))
        ).all()
    )
    assignments_by_course: dict[int, list[Assignment]] = {}
    for a in all_assignments:
        assignments_by_course.setdefault(a.course_id, []).append(a)

    all_submissions = list(
        db.scalars(
            select(AssignmentSubmission).where(
                AssignmentSubmission.assignment_id.in_(
                    [a.id for a in all_assignments] or [-1]
                )
            )
        ).all()
    )
    subs_by_student_assignment: dict[tuple[int, int], AssignmentSubmission] = {
        (s.student_id, s.assignment_id): s for s in all_submissions
    }

    user_ids_to_fetch = set(e.student_id for e in active_enrollments)
    if user_ids_to_fetch:
        users = db.scalars(select(User).where(User.id.in_(user_ids_to_fetch))).all()
        for u in users:
            student_name[u.id] = u.full_name

    for enr in active_enrollments:
        sid = enr.student_id
        cid = enr.course_id

        # 1. Assignments — an assignment the student never handed in scores 0,
        #    which is what makes the completion rate actually bite. One that was
        #    submitted but not yet graded is left out of the average entirely:
        #    that is the teacher's backlog, not the student's failure.
        course_assigns = assignments_by_course.get(cid, [])
        if course_assigns:
            submissions = {
                a.id: subs_by_student_assignment.get((sid, a.id))
                for a in course_assigns
            }
            submitted = [s for s in submissions.values() if s is not None]
            assign_completion = round(len(submitted) / len(course_assigns), 3)

            graded = [s.score for s in submitted if s.score is not None]
            missing = len(course_assigns) - len(submitted)
            counted = len(graded) + missing
            assign_avg = round(sum(graded) / counted, 2) if counted else None
        else:
            # No assignments in the course: the component does not exist here,
            # rather than existing and being perfect.
            assign_completion = None
            assign_avg = None

        # 2. Exams / session grades in the period.
        scores = avg_acc.get((sid, cid))
        exams_avg = round(sum(scores) / len(scores), 2) if scores else None

        # 3. Attendance in the period.
        att_p, att_t = per_student.get((sid, cid), (0, 0))
        att_rate = round(att_p / att_t, 3) if att_t > 0 else None

        # 4. Consolidated score: 40% assignments + 50% exams + 10% attendance,
        #    renormalized over the components that actually have data. A missing
        #    component must not be scored as a perfect 10 — that used to rank a
        #    student with no submissions, no grades and no attendance as the
        #    academy's top performer.
        parts: list[tuple[float, float]] = []  # (value on a 0–10 scale, weight)
        if assign_avg is not None:
            parts.append((assign_avg, 0.40))
        if exams_avg is not None:
            parts.append((exams_avg, 0.50))
        if att_rate is not None:
            parts.append((att_rate * 10.0, 0.10))

        total_weight = sum(w for _, w in parts)
        consolidated = (
            round(sum(v * w for v, w in parts) / total_weight, 2)
            if total_weight
            else None
        )

        # 5. Status. "No data" is its own answer: an enrolment nobody has
        #    recorded anything against cannot be called optimal or critical.
        if consolidated is None:
            perf_status = "no_data"
        elif consolidated >= 8.5:
            perf_status = "optimal"
        elif consolidated < 6.0:
            perf_status = "critical"
        else:
            perf_status = "warning"

        report.consolidated_students.append(
            ConsolidatedStudent(
                student_id=sid,
                student_name=student_name.get(sid, f"#{sid}"),
                course_id=cid,
                course_name=course_name.get(cid, f"#{cid}"),
                assignments_avg=assign_avg,
                assignments_completion_rate=assign_completion,
                exams_avg=exams_avg,
                attendance_rate=att_rate,
                consolidated_score=consolidated,
                performance_status=perf_status,
            )
        )

    # Worst first, so the people who need attention are at the top. Enrolments
    # with nothing recorded sort last: they are a data gap to chase, not a
    # performance problem to triage.
    report.consolidated_students.sort(
        key=lambda cs: (cs.consolidated_score is None, cs.consolidated_score or 0.0)
    )
    return report
