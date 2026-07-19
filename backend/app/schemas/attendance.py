from datetime import date as date_type
from typing import ClassVar

from pydantic import BaseModel, ConfigDict

from app.models.enums import AttendanceStatus
from app.schemas.base import PatchModel


class AttendanceCreate(BaseModel):
    enrollment_id: int
    session_id: int
    status: AttendanceStatus = AttendanceStatus.present


class AttendanceUpdate(PatchModel):
    NON_NULLABLE: ClassVar[tuple[str, ...]] = ("status",)
    status: AttendanceStatus | None = None


class AttendanceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    enrollment_id: int
    session_id: int
    # Carried from the session for convenience (read-only).
    date: date_type
    status: AttendanceStatus
