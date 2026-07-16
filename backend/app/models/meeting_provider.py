from __future__ import annotations

from sqlalchemy import Boolean
from sqlalchemy import Enum as SqlEnum
from sqlalchemy import Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import ProviderName


class MeetingProvider(Base):
    __tablename__ = "meeting_providers"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[ProviderName] = mapped_column(
        SqlEnum(ProviderName, name="provider_name"), unique=True
    )
    # Fernet-encrypted JSON blob of credentials. Nullable for the manual provider.
    api_credentials_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    meetings: Mapped[list["VirtualMeeting"]] = relationship(back_populates="provider")
