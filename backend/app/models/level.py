from __future__ import annotations

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Level(Base):
    __tablename__ = "levels"

    id: Mapped[int] = mapped_column(primary_key=True)
    language_id: Mapped[int] = mapped_column(
        ForeignKey("languages.id", ondelete="CASCADE"), index=True
    )
    code: Mapped[str] = mapped_column(String(10))  # A1..C2
    name: Mapped[str] = mapped_column(String(100))

    language: Mapped["Language"] = relationship(back_populates="levels")
    courses: Mapped[list["Course"]] = relationship(
        back_populates="level", cascade="all, delete-orphan"
    )
