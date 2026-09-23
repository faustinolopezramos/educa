from __future__ import annotations

from datetime import date, time
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.base import Money


class TeacherHourlyRateUpdate(BaseModel):
    hourly_rate: Money = Field(ge=0, description="Tarifa por hora del docente")
    # Desde cuándo rige. Por defecto, hoy: cambiar la tarifa no debe reescribir
    # lo que ya se liquidó.
    effective_from: date | None = None


class TeacherPayrollSessionItem(BaseModel):
    session_id: int
    course_id: int
    course_name: str
    date: date
    start_time: time
    end_time: time
    duration_hours: float
    status: str
    register_closed: bool
    hourly_rate: Money
    amount: Money


class TeacherPayrollReport(BaseModel):
    teacher_id: int
    teacher_name: str
    email: str
    hourly_rate: Money
    date_from: date
    date_to: date
    total_sessions: int
    total_hours: float
    total_amount: Money
    sessions: list[TeacherPayrollSessionItem]


class TeacherPayrollSummary(BaseModel):
    teacher_id: int
    teacher_name: str
    email: str
    hourly_rate: Money
    total_sessions: int
    total_hours: float
    total_amount: Money


class AcademyPayrollSummary(BaseModel):
    date_from: date
    date_to: date
    total_teachers: int
    total_hours: float
    total_amount: Money
    teachers: list[TeacherPayrollSummary]
