from __future__ import annotations

from datetime import date as date_type

from sqlalchemy import Date, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class AcademicHoliday(Base):
    """A day the academy does not hold classes.

    Session generation skips these dates, so a term never materializes a class
    on a public holiday or a scheduled break.
    """

    __tablename__ = "academic_holidays"

    id: Mapped[int] = mapped_column(primary_key=True)
    date: Mapped[date_type] = mapped_column(Date, unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
