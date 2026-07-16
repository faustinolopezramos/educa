from __future__ import annotations

from sqlalchemy import Enum as SqlEnum
from sqlalchemy import Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import UserRole


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[UserRole] = mapped_column(
        SqlEnum(UserRole, name="user_role"), default=UserRole.student
    )
    full_name: Mapped[str] = mapped_column(String(255))
    timezone: Mapped[str] = mapped_column(String(64), default="UTC")
    # Optional weekly teaching-hours cap for teachers (NULL = uncapped).
    max_weekly_hours: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # A teacher owns many schedules
    schedules: Mapped[list["Schedule"]] = relationship(
        back_populates="teacher", foreign_keys="Schedule.teacher_id"
    )
    # A student has many enrollments
    enrollments: Mapped[list["Enrollment"]] = relationship(back_populates="student")
