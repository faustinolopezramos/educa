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


class ReportRead(BaseModel):
    period: str
    date_from: date
    date_to: date
    sessions_total: int
    sessions_held: int
    sessions_cancelled: int
    attendance_rate: float | None
    attendance_by_course: list[CourseAttendanceRead]
    grades_recorded: int
    grade_average: float | None
    at_risk: list[AtRiskStudentRead]
