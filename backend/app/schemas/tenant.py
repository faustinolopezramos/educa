from datetime import datetime

from pydantic import BaseModel, Field

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


class TenantCreate(TenantBase):
    pass


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



class TenantRead(TenantBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
