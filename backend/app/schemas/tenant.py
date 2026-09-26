from datetime import datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, Field, field_validator

from app.schemas.base import PatchModel


class TenantBase(BaseModel):
    name: str = Field(..., max_length=150)
    slug: str = Field(..., max_length=50, pattern="^[a-z0-9-]+$")
    logo_url: str | None = Field(None, max_length=500)
    is_active: bool = True
    max_active_students: int = Field(100, ge=1)
    timezone: str = Field("America/Guatemala", max_length=50)
    currency: str = Field("USD", max_length=10)
    primary_color: str | None = Field(None, max_length=20)
    secondary_color: str | None = Field(None, max_length=20)
    custom_domain: str | None = Field(None, max_length=255)
    tax_id: str | None = Field(None, max_length=50)
    phone: str | None = Field(None, max_length=50)
    address: str | None = Field(None, max_length=255)


def _known_timezone(value: str | None) -> str | None:
    """Una zona que `ZoneInfo` no conoce rompe la ventana del aula virtual de
    toda la academia en cuanto alguien abre una clase: mejor rechazarla aquí."""
    if value is None:
        return value
    try:
        ZoneInfo(value)
    except (ZoneInfoNotFoundError, ValueError):
        raise ValueError(f"Zona horaria desconocida: {value}")
    return value


class TenantCreate(TenantBase):
    _tz = field_validator("timezone")(_known_timezone)


class TenantUpdate(PatchModel):
    name: str | None = Field(None, max_length=150)
    slug: str | None = Field(None, max_length=50, pattern="^[a-z0-9-]+$")
    logo_url: str | None = Field(None, max_length=500)
    is_active: bool | None = None
    max_active_students: int | None = Field(None, ge=1)
    timezone: str | None = Field(None, max_length=50)
    currency: str | None = Field(None, max_length=10)
    primary_color: str | None = Field(None, max_length=20)
    secondary_color: str | None = Field(None, max_length=20)
    custom_domain: str | None = Field(None, max_length=255)
    tax_id: str | None = Field(None, max_length=50)
    phone: str | None = Field(None, max_length=50)
    address: str | None = Field(None, max_length=255)

    _tz = field_validator("timezone")(_known_timezone)


class TenantRead(TenantBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class TenantSummary(TenantRead):
    """An academy as the platform owner scans the list: identity plus usage."""

    #: Seats held right now — what `max_active_students` is measured against.
    active_students: int = 0
    #: Admins of the academy. Zero means nobody can run it.
    admins: int = 0
    #: Every active account, i.e. who loses access if the academy is suspended.
    active_users: int = 0
