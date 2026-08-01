from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, Integer, String

from app.core.database import Base


class Tenant(Base):
    __tablename__ = "tenants"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(150), nullable=False)
    slug = Column(String(50), nullable=False, unique=True, index=True)
    logo_url = Column(String(500), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    max_active_students = Column(Integer, nullable=False, default=100)
    timezone = Column(String(50), nullable=False, default="America/Guatemala")
    currency = Column(String(10), nullable=False, default="USD")
    primary_color = Column(String(20), nullable=True)
    secondary_color = Column(String(20), nullable=True)
    custom_domain = Column(String(255), nullable=True, unique=True, index=True)
    tax_id = Column(String(50), nullable=True)
    phone = Column(String(50), nullable=True)
    address = Column(String(255), nullable=True)
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

