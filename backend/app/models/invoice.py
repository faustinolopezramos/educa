from __future__ import annotations

from datetime import datetime

from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Invoice(Base):
    """An internal receipt/comprobante for an enrollment — same shape as
    `Certificate` (a sequential `code`, an issuer, a PDF). No fiscal
    integration (DTE/factura electrónica) in this scope."""

    __tablename__ = "invoices"

    id: Mapped[int] = mapped_column(primary_key=True)
    enrollment_id: Mapped[int] = mapped_column(
        ForeignKey("enrollments.id", ondelete="CASCADE"), index=True
    )
    code: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    issued_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    issued_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    enrollment: Mapped["Enrollment"] = relationship()
