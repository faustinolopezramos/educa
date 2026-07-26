from datetime import datetime

from pydantic import BaseModel, ConfigDict


class InvoiceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    enrollment_id: int
    code: str
    total_amount: float
    issued_at: datetime
    issued_by: int | None
