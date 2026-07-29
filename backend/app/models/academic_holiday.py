from __future__ import annotations

from datetime import date as date_type

from sqlalchemy import Date, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class AcademicHoliday(Base):
    """A day the academy does not hold classes.

    Session generation skips these dates, so a term never materializes a class
    on a public holiday or a scheduled break.
    """

    __tablename__ = "academic_holidays"
    # Academies keep their own calendars: one may close for a local feast the
    # other works through, so a date is unique per tenant, not globally.
    # `NULLS NOT DISTINCT` because a tenant-less row is a real case here (an
    # installation that predates multi-tenancy). Postgres treats NULLs as
    # distinct by default, which would silently allow the same date twice.
    __table_args__ = (
        UniqueConstraint(
            "tenant_id",
            "date",
            name="uq_holidays_tenant_date",
            postgresql_nulls_not_distinct=True,
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    tenant_id: Mapped[int | None] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True, index=True
    )
    date: Mapped[date_type] = mapped_column(Date, index=True)
    name: Mapped[str] = mapped_column(String(120))
