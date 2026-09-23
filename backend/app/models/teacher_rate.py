from __future__ import annotations

from datetime import date as date_type, datetime
from decimal import Decimal

from sqlalchemy import Date, DateTime, ForeignKey, Numeric, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class TeacherRate(Base):
    """Cuánto cobra por hora un profesor y desde cuándo.

    La nómina leía `users.hourly_rate`, el valor de hoy, para liquidar clases de
    cualquier fecha: subirle la tarifa a alguien reescribía hacia atrás lo que
    ya se le había pagado. Aquí cada tarifa tiene fecha de entrada en vigor, y
    una sesión se paga con la que regía el día que se impartió.

    `users.hourly_rate` se conserva como la tarifa vigente — es lo que enseñan
    las pantallas y lo que se edita —, pero quien manda para calcular es esta
    tabla.
    """

    __tablename__ = "teacher_rates"
    __table_args__ = (
        UniqueConstraint("teacher_id", "effective_from", name="uq_teacher_rate_from"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    tenant_id: Mapped[int | None] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True, index=True
    )
    teacher_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    hourly_rate: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    effective_from: Mapped[date_type] = mapped_column(Date)
    created_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
