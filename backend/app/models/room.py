from __future__ import annotations

from sqlalchemy import Boolean, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Room(Base):
    """A physical classroom or a reusable virtual room a class can occupy."""

    __tablename__ = "rooms"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    capacity: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_virtual: Mapped[bool] = mapped_column(Boolean, default=False)

    schedules: Mapped[list["Schedule"]] = relationship(back_populates="room")
