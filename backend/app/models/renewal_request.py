from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Index, Numeric, Text, func, text
from sqlalchemy import Enum as SqlEnum
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.enums import ProposalStatus


class RenewalRequest(Base):
    """A graduated student asking for a seat in the next level.

    The student picks the group; dirección approves or rejects. Approving opens
    a real matrícula through the same checks as a manual one, with the cuota
    copied from the enrollment the student just finished — so nothing here is a
    seat or a debt until someone at the academy says yes.

    `from_enrollment_id` is the graduated matrícula the request grows out of: a
    student renews *from* a course, and it is what the one-pending-at-a-time
    rule hangs on.
    """

    __tablename__ = "renewal_requests"
    __table_args__ = (
        Index(
            "uq_renewal_pending_per_enrollment",
            "from_enrollment_id",
            unique=True,
            postgresql_where=text("status = 'pending'"),
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    student_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    from_enrollment_id: Mapped[int] = mapped_column(
        ForeignKey("enrollments.id", ondelete="CASCADE")
    )
    course_id: Mapped[int] = mapped_column(
        ForeignKey("courses.id", ondelete="CASCADE"), index=True
    )
    status: Mapped[ProposalStatus] = mapped_column(
        SqlEnum(ProposalStatus, name="proposal_status"),
        default=ProposalStatus.pending,
        index=True,
    )
    # The cuota the new matrícula will carry, fixed when the student asks so the
    # approver sees what they are agreeing to.
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"))
    review_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    reviewed_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    # The matrícula an approval opened.
    enrollment_id: Mapped[int | None] = mapped_column(
        ForeignKey("enrollments.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
