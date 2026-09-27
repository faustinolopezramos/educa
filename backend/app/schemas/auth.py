from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.schemas.user import Password, UserRead


class Token(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserRead


class RefreshRequest(BaseModel):
    refresh_token: str


class SupabaseLoginRequest(BaseModel):
    supabase_token: str


class AcademyRegisterRequest(BaseModel):
    academy_name: str = Field(..., min_length=2, max_length=150)
    slug: str = Field(..., min_length=2, max_length=50, pattern="^[a-z0-9-]+$")
    admin_name: str = Field(..., min_length=2, max_length=255)
    admin_email: EmailStr
    password: Password
    phone: str | None = Field(None, max_length=50)
    plan_tier: str = Field("free", max_length=50)

