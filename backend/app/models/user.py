from __future__ import annotations

from decimal import Decimal

from sqlalchemy import Enum as SqlEnum
from sqlalchemy import Boolean, ForeignKey, Index, Integer, JSON, Numeric, String, text
from sqlalchemy import true as sa_true
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import UserRole


from sqlalchemy import UniqueConstraint


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        UniqueConstraint("tenant_id", "email", name="uq_users_tenant_email"),
        # La identificación personal es única dentro de la academia. Parcial
        # sobre NOT NULL, porque el campo sigue siendo opcional para las cuentas
        # anteriores a él y varias filas sin documento no se estorban.
        Index(
            "uq_users_tenant_cui_passport",
            "tenant_id",
            "cui_passport",
            unique=True,
            postgresql_where=text("cui_passport IS NOT NULL"),
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    tenant_id: Mapped[int | None] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True, index=True
    )
    email: Mapped[str] = mapped_column(String(255), index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[UserRole] = mapped_column(
        SqlEnum(UserRole, name="user_role"), default=UserRole.student
    )
    full_name: Mapped[str] = mapped_column(String(255))
    timezone: Mapped[str] = mapped_column(String(64), default="UTC")
    # Optional weekly teaching-hours cap for teachers (NULL = uncapped).
    max_weekly_hours: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Teacher hourly rate for payroll settlement (NULL or 0 = not configured).
    hourly_rate: Mapped[Decimal | None] = mapped_column(
        Numeric(12, 2), nullable=True, default=Decimal("0.00")
    )
    # Bumped on password change so refresh tokens issued before it stop working.
    token_version: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    # Whether the account may be used at all. A teacher who leaves the academy
    # cannot be deleted — their schedules hold the row, and their past grades and
    # attendance have to stay — so "baja" is this flag, not a DELETE. An inactive
    # account cannot log in and is not offered in any picker.
    is_active: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default=sa_true(), nullable=False
    )
    # Contact details — shared by every role (admin/teacher/student are all a
    # User), so a student's and a teacher's phone/address/nationality live in
    # exactly one place rather than a per-role table.
    phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    address: Mapped[str | None] = mapped_column(String(255), nullable=True)
    cui_passport: Mapped[str | None] = mapped_column(
        String(64), nullable=True, index=True
    )
    nationality_id: Mapped[int | None] = mapped_column(
        ForeignKey("nationalities.id", ondelete="SET NULL"), nullable=True, index=True
    )
    permissions: Mapped[list[str] | None] = mapped_column(JSON, nullable=True, default=list)
    # Supabase Auth user ID for linking with Supabase Auth
    supabase_uid: Mapped[str | None] = mapped_column(
        String(64), nullable=True, unique=True, index=True
    )

    nationality: Mapped["Nationality | None"] = relationship()
    # A teacher owns many schedules
    schedules: Mapped[list["Schedule"]] = relationship(
        back_populates="teacher", foreign_keys="Schedule.teacher_id"
    )
    # A student has many enrollments
    enrollments: Mapped[list["Enrollment"]] = relationship(back_populates="student")
