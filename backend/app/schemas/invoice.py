from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.schemas.base import Money


class InvoiceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    enrollment_id: int
    code: str
    total_amount: Money
    issued_at: datetime
    issued_by: int | None
