from __future__ import annotations

from sqlalchemy import Enum as SqlEnum
from sqlalchemy import String
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

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True)
    kind: Mapped[TrackKind] = mapped_column(
        SqlEnum(TrackKind, name="track_kind"), default=TrackKind.language
    )

    levels: Mapped[list["Level"]] = relationship(
        back_populates="language", cascade="all, delete-orphan"
    )
