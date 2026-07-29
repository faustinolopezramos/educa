from __future__ import annotations

from sqlalchemy import Boolean, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Room(Base):
    """A physical classroom or a reusable virtual room a class can occupy."""

    __tablename__ = "rooms"

    id: Mapped[int] = mapped_column(primary_key=True)
    # A classroom is physical property of one academy; it has no path to a
    # tenant through any other table, so it carries its own.
    tenant_id: Mapped[int | None] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True, index=True
    )
    name: Mapped[str] = mapped_column(String(120))
    capacity: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_virtual: Mapped[bool] = mapped_column(Boolean, default=False)

    schedules: Mapped[list["Schedule"]] = relationship(back_populates="room")
