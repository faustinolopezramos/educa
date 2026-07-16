from __future__ import annotations

from sqlalchemy import Float, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Grade(Base):
    __tablename__ = "grades"

    id: Mapped[int] = mapped_column(primary_key=True)
    enrollment_id: Mapped[int] = mapped_column(
        ForeignKey("enrollments.id", ondelete="CASCADE"), index=True
    )
    evaluation_name: Mapped[str] = mapped_column(String(150))
    score: Mapped[float] = mapped_column(Float)

    enrollment: Mapped["Enrollment"] = relationship(back_populates="grades")
