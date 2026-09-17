from __future__ import annotations

from datetime import date, datetime, time

from pydantic import BaseModel, ConfigDict

from app.models.enums import MakeUpStatus, Modality


class MakeUpCreditCreate(BaseModel):
    student_id: int
    enrollment_id: int
    origin_session_id: int | None = None
    expires_at: date | None = None
    notes: str | None = None


class MakeUpCreditRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    student_id: int
    enrollment_id: int
    origin_session_id: int | None = None
    target_session_id: int | None = None
    status: MakeUpStatus
    issued_at: datetime
    expires_at: date
    notes: str | None = None

    # Informational enrichment for UI
    student_name: str | None = None
    course_name: str | None = None
    level_name: str | None = None
    origin_session_date: date | None = None
    target_session_date: date | None = None
    target_session_time: str | None = None
    target_course_name: str | None = None


class MakeUpBookRequest(BaseModel):
    target_session_id: int


class CandidateSessionRead(BaseModel):
    session_id: int
    course_id: int
    course_name: str
    level_id: int
    level_name: str
    date: date
    start_time: time
    end_time: time
    teacher_name: str
    modality: Modality
    room_name: str | None = None
    max_students: int
    occupied_seats: int
    available_seats: int
