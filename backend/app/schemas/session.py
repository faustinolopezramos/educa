from datetime import date
from typing import ClassVar

from pydantic import BaseModel, ConfigDict

from app.models.enums import SessionStatus
from app.schemas.base import PatchModel


class ClassSessionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    schedule_id: int
    date: date
    status: SessionStatus
    topic: str | None
    cancel_reason: str | None
    origin_session_id: int | None


class SessionGenerate(BaseModel):
    schedule_id: int


class SessionEnsure(BaseModel):
    schedule_id: int
    date: date


class SessionCancel(BaseModel):
    reason: str | None = None


class SessionReschedule(BaseModel):
    new_date: date


class SessionUpdate(PatchModel):
    NON_NULLABLE: ClassVar[tuple[str, ...]] = ("status",)
    status: SessionStatus | None = None
    topic: str | None = None
