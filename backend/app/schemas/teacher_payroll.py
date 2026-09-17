from __future__ import annotations

from datetime import date, time

from pydantic import BaseModel, ConfigDict, Field


class TeacherHourlyRateUpdate(BaseModel):
    hourly_rate: float = Field(ge=0, description="Tarifa por hora del docente")


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
    hourly_rate: float
    amount: float


class TeacherPayrollReport(BaseModel):
    teacher_id: int
    teacher_name: str
    email: str
    hourly_rate: float
    date_from: date
    date_to: date
    total_sessions: int
    total_hours: float
    total_amount: float
    sessions: list[TeacherPayrollSessionItem]


class TeacherPayrollSummary(BaseModel):
    teacher_id: int
    teacher_name: str
    email: str
    hourly_rate: float
    total_sessions: int
    total_hours: float
    total_amount: float


class AcademyPayrollSummary(BaseModel):
    date_from: date
    date_to: date
    total_teachers: int
    total_hours: float
    total_amount: float
    teachers: list[TeacherPayrollSummary]
