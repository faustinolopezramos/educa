from __future__ import annotations

from sqlalchemy import Float, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class CourseEvaluation(Base):
    """How much each named evaluation weighs toward a course's final grade.

    Grades are matched to these by `evaluation_name`. A grade whose name is not
    listed here counts with the default weight of 1, so a course with no weights
    configured falls back to a plain average.
    """

    __tablename__ = "course_evaluations"
    __table_args__ = (
        UniqueConstraint("course_id", "name", name="uq_course_evaluation_name"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    course_id: Mapped[int] = mapped_column(
        ForeignKey("courses.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(150))
    weight: Mapped[float] = mapped_column(Float, default=1.0)
