from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class RefreshSession(Base):
    """One issued refresh token, tracked so it can be rotated and revoked.

    Each successful login or refresh creates a row identified by `jti` (the
    same value embedded in the token's payload). Refreshing rotates it: the
    row is marked `revoked_at` and a new one is created for the token handed
    back. Presenting an already-revoked `jti` means a refresh token was
    replayed after rotation — the strongest signal available that it was
    stolen — and is handled by revoking every session of that user.
    """

    __tablename__ = "refresh_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    jti: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    revoked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
