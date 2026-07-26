from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.enums import PaymentKind


class PaymentCreate(BaseModel):
    enrollment_id: int
    kind: PaymentKind
    amount: float
    method: str | None = None
    notes: str | None = None


class PaymentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    enrollment_id: int
    kind: PaymentKind
    amount: float
    method: str | None
    paid_at: datetime
    recorded_by: int | None
    notes: str | None


class EnrollmentLedger(BaseModel):
    """A movements list plus the derived balance — the balance is never
    stored, only computed, so it can't drift from the sum of its parts."""

    enrollment_id: int
    charged: float
    paid: float
    balance: float
    movements: list[PaymentRead]
