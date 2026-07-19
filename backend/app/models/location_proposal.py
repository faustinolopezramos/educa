from __future__ import annotations

from sqlalchemy import Enum as SqlEnum
from sqlalchemy import ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import Modality, ProposalStatus, ProviderName


class LocationProposal(Base):
    """A teacher's proposed location for a schedule, awaiting admin review.

    Kept separate from the schedule's *effective* location so a pending proposal
    never corrupts the class that is currently running. Approving copies the
    proposal onto the schedule; rejecting leaves the schedule untouched.
    """

    __tablename__ = "location_proposals"

    id: Mapped[int] = mapped_column(primary_key=True)
    schedule_id: Mapped[int] = mapped_column(
        ForeignKey("schedules.id", ondelete="CASCADE"), index=True
    )
    proposed_by: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))

    modality: Mapped[Modality] = mapped_column(SqlEnum(Modality, name="modality"))
    room_id: Mapped[int | None] = mapped_column(
        ForeignKey("rooms.id", ondelete="SET NULL"), nullable=True
    )
    provider: Mapped[ProviderName | None] = mapped_column(
        SqlEnum(ProviderName, name="provider_name"), nullable=True
    )
    join_url: Mapped[str | None] = mapped_column(Text, nullable=True)

    status: Mapped[ProposalStatus] = mapped_column(
        SqlEnum(ProposalStatus, name="proposal_status"),
        default=ProposalStatus.pending,
        index=True,
    )
    review_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    reviewed_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    schedule: Mapped["Schedule"] = relationship()
