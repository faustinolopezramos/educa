from __future__ import annotations

from sqlalchemy import Enum as SqlEnum
from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import TrackKind


class Language(Base):
    """A track in the academic catalog. Despite the name, a row here is not
    necessarily a spoken language — `kind` distinguishes Idiomas from the
    Competencias Digitales/Negocios tracks, which reuse the exact same
    Language→Level→Course tree (a Level becomes a "módulo" instead of a CEFR
    stage). `kind` only drives how the Catálogo Académico groups the offer;
    it changes nothing about how Level/Course behave."""

    __tablename__ = "languages"
    # Each academy keeps its own catalog, so the name is unique *within* a
    # tenant — a global unique would mean the first academy to create "Inglés"
    # takes the name away from every other one.
    __table_args__ = (
        UniqueConstraint(
            "tenant_id",
            "name",
            name="uq_languages_tenant_name",
            # Without this, two tenant-less rows could share a name, because
            # Postgres counts NULLs as distinct from one another.
            postgresql_nulls_not_distinct=True,
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    tenant_id: Mapped[int | None] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True, index=True
    )
    name: Mapped[str] = mapped_column(String(100))
    kind: Mapped[TrackKind] = mapped_column(
        SqlEnum(TrackKind, name="track_kind"), default=TrackKind.language
    )

    levels: Mapped[list["Level"]] = relationship(
        back_populates="language", cascade="all, delete-orphan"
    )
