from __future__ import annotations

from sqlalchemy import Boolean, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class CourseTeacher(Base):
    """Association: a teacher is assigned to teach a course.

    This is the *permission* to teach the course, distinct from a `Schedule`,
    which is a concrete weekly slot. A teacher can be assigned before any
    schedule exists, a course can have co-teachers, and — crucially — every
    schedule's teacher must be assigned here first. Academic authorization
    (`teacher_teaches_course`) reads this table, not the schedules.
    """

    __tablename__ = "course_teachers"
    __table_args__ = (
        UniqueConstraint("course_id", "teacher_id", name="uq_course_teacher"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    course_id: Mapped[int] = mapped_column(
        ForeignKey("courses.id", ondelete="CASCADE"), index=True
    )
    teacher_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    # The lead teacher of the course, when there are several. Informational.
    is_lead: Mapped[bool] = mapped_column(Boolean, default=False)
