from decimal import Decimal

from app.schemas.base import Money
from pydantic import BaseModel


class KardexSummary(BaseModel):
    global_gpa: float
    overall_attendance_rate: float
    total_courses_passed: int
    total_courses_failed: int
    person_status: str
    person_status_label: str
    outstanding_balance: Money
    skills_breakdown: dict[str, float] = {}


class KardexCourseEntry(BaseModel):
    enrollment_id: int
    course_id: int
    course_title: str
    level_name: str
    status: str
    status_label: str
    enrollment_code: str
    final_score: float | None = None
    passed: bool | None = None
    balance: Money = Decimal("0.00")
    skills: dict[str, float] = {}
    # Deliberately no `created_at`: `Enrollment` has no such column, and the
    # field only ever existed here — declared, never rendered by the panel that
    # consumes it, and impossible to fill. Ordering by the serial key gives the
    # chronology the expediente actually needed. Add a real column if the date
    # is ever meant to be shown.


class StudentKardexResponse(BaseModel):
    student_id: int
    student_name: str
    student_email: str
    phone: str | None = None
    nationality: str | None = None
    summary: KardexSummary
    history: list[KardexCourseEntry]
