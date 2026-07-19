from datetime import datetime

from pydantic import BaseModel, ConfigDict


class AuditLogRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    actor_id: int | None
    action: str
    entity: str
    entity_id: int
    before: dict | None
    after: dict | None
    at: datetime
