from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import PaymentKind
from app.schemas.base import Money


class PaymentCreate(BaseModel):
    enrollment_id: int
    kind: PaymentKind
    # A ledger movement is always a positive amount; its direction is `kind`.
    # A negative one would silently invert a charge into a credit and quietly
    # mark a debt as settled.
    amount: Money = Field(gt=0)
    method: str | None = None
    receipt_number: str | None = None
    # Only meaningful on a `charge`: the date it falls due. Without one the
    # charge is open-ended and can never make the enrollment delinquent.
    due_date: date | None = None
    notes: str | None = None


class PaymentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    enrollment_id: int
    kind: PaymentKind
    amount: Money
    method: str | None
    receipt_number: str | None
    due_date: date | None
    paid_at: datetime
    recorded_by: int | None
    notes: str | None


class PaymentStatusRefresh(BaseModel):
    """How many enrollments changed status in the last sweep."""

    updated: int


class EnrollmentLedger(BaseModel):
    """A movements list plus the derived balance — the balance is never
    stored, only computed, so it can't drift from the sum of its parts."""

    enrollment_id: int
    charged: Money
    paid: Money
    balance: Money
    movements: list[PaymentRead]
