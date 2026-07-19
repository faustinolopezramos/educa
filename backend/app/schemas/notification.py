from datetime import datetime

from pydantic import BaseModel, ConfigDict


class NotificationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    kind: str
    title: str
    body: str
    read_at: datetime | None
    created_at: datetime
