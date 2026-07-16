from __future__ import annotations

from sqlalchemy import ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class TeacherLanguage(Base):
    """Association: a teacher is qualified to teach a given language."""

    __tablename__ = "teacher_languages"
    __table_args__ = (
        UniqueConstraint(
            "teacher_id", "language_id", name="uq_teacher_language"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    teacher_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    language_id: Mapped[int] = mapped_column(
        ForeignKey("languages.id", ondelete="CASCADE"), index=True
    )
