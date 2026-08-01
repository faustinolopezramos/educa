from datetime import date

from pydantic import BaseModel


class CourseAttendanceRead(BaseModel):
    course_id: int
    course_name: str
    present: int
    total: int
    rate: float | None


class AtRiskStudentRead(BaseModel):
    student_id: int
    student_name: str
    course_id: int
    course_name: str
    attendance_rate: float | None
    average: float | None
    reasons: list[str]


class ConsolidatedStudentReport(BaseModel):
    student_id: int
    student_name: str
    course_id: int
    course_name: str
    # `None` = no data recorded for that component in the period. Distinct from
    # 0.0, and the UI must render it as "—" rather than as a zero.
    assignments_avg: float | None
    assignments_completion_rate: float | None
    exams_avg: float | None
    attendance_rate: float | None
    consolidated_score: float | None
    performance_status: str  # optimal, warning, critical, no_data


class ReportRead(BaseModel):
    period: str
    date_from: date
    date_to: date
    sessions_total: int
    sessions_held: int
    sessions_cancelled: int
    # Defaulted so an older client that does not know the field still parses.
    sessions_pending: int = 0
    attendance_rate: float | None
    attendance_by_course: list[CourseAttendanceRead]
    grades_recorded: int
    grade_average: float | None
    at_risk: list[AtRiskStudentRead]
    consolidated_students: list[ConsolidatedStudentReport] = []
