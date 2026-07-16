from datetime import date as date_type

from pydantic import BaseModel, ConfigDict

from app.models.enums import AttendanceStatus


class AttendanceCreate(BaseModel):
    enrollment_id: int
    date: date_type
    status: AttendanceStatus = AttendanceStatus.present


class AttendanceUpdate(BaseModel):
    date: date_type | None = None
    status: AttendanceStatus | None = None


class AttendanceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    enrollment_id: int
    date: date_type
    status: AttendanceStatus
