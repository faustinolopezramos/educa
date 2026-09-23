from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import Date, DateTime
from sqlalchemy import Enum as SqlEnum
from decimal import Decimal

from sqlalchemy import ForeignKey, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import PaymentKind


class Payment(Base):
    """A single ledger entry against an enrollment's account: either a
    `charge` (cobro — money owed) or a `payment` (pago — money received).
    The running balance of an enrollment is sum(charge) - sum(payment),
    computed on read rather than stored, so it can never drift out of sync.
    """

    __tablename__ = "payments"

    id: Mapped[int] = mapped_column(primary_key=True)
    enrollment_id: Mapped[int] = mapped_column(
        ForeignKey("enrollments.id", ondelete="CASCADE"), index=True
    )
    kind: Mapped[PaymentKind] = mapped_column(SqlEnum(PaymentKind, name="payment_kind"))
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    method: Mapped[str | None] = mapped_column(String(32), nullable=True)
    # Número de boleta de pago, depósito o transferencia bancaria
    receipt_number: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # When a `charge` falls due. NULL means open-ended — an amount owed with no
    # agreed date, which can never become delinquent on its own. Ignored on
    # `payment` rows, which record money already received.
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    paid_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    recorded_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    enrollment: Mapped["Enrollment"] = relationship(back_populates="payments")
