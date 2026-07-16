from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.enums import MeetingStatus, ProviderName


# ---- Provider ----
class ProviderRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: ProviderName
    is_active: bool


class ProviderUpsert(BaseModel):
    name: ProviderName
    is_active: bool = True
    # Plaintext credentials; encrypted before persisting. Optional for manual.
    credentials: dict | None = None


# ---- Virtual meeting ----
class VirtualMeetingCreate(BaseModel):
    schedule_id: int
    provider: ProviderName = ProviderName.manual
    start_time: datetime
    end_time: datetime | None = None
    # For the manual provider the teacher pastes the join URL directly.
    join_url: str | None = None


class VirtualMeetingUpdate(BaseModel):
    join_url: str | None = None
    host_url: str | None = None
    status: MeetingStatus | None = None
    recording_url: str | None = None
    start_time: datetime | None = None
    end_time: datetime | None = None


class VirtualMeetingRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    schedule_id: int
    provider_id: int
    external_meeting_id: str | None
    join_url: str | None
    host_url: str | None
    start_time: datetime
    end_time: datetime | None
    status: MeetingStatus
    recording_url: str | None
