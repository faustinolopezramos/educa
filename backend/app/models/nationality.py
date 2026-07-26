from __future__ import annotations

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Nationality(Base):
    """A flat, admin-managed catalog — same shape as `Language`. Deliberately
    has no region/continent column: grouping by region (if ever wanted) is a
    presentation concern, not a fact this table needs to encode."""

    __tablename__ = "nationalities"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True)
