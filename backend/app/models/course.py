from __future__ import annotations

from datetime import date

from sqlalchemy import Date, Float, ForeignKey, Integer, String
from sqlalchemy import Enum as SqlEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import CourseStatus


class Course(Base):
    __tablename__ = "courses"

    id: Mapped[int] = mapped_column(primary_key=True)
    tenant_id: Mapped[int | None] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True, index=True
    )
    level_id: Mapped[int] = mapped_column(
        ForeignKey("levels.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(150))
    # Where the course is in its own life, which the calendar cannot say: a
    # half-built course with no timetable used to look exactly like one about to
    # start, and students could be seated in it.
    #
    # The default is `open`, matching the column default, because a row built
    # directly — a fixture, a seed, an existing database being migrated — is one
    # nobody stated a lifecycle intent for, and treating those as drafts would
    # retroactively close enrolment on a working academy. Courses created
    # *through the API* start as drafts: that is `CourseCreate.status`, and it is
    # where the intent actually exists.
    status: Mapped[CourseStatus] = mapped_column(
        SqlEnum(CourseStatus, name="course_status"),
        default=CourseStatus.open,
        server_default=CourseStatus.open.value,
        nullable=False,
    )
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    periodicity: Mapped[str | None] = mapped_column(String(30), nullable=True)
    max_students: Mapped[int] = mapped_column(Integer, default=20)
    # Minimum final grade (0–10) to pass the course.
    passing_score: Mapped[float] = mapped_column(Float, default=6.0)

    level: Mapped["Level"] = relationship(back_populates="courses")
    schedules: Mapped[list["Schedule"]] = relationship(
        back_populates="course", cascade="all, delete-orphan"
    )
    enrollments: Mapped[list["Enrollment"]] = relationship(
        back_populates="course", cascade="all, delete-orphan"
    )
