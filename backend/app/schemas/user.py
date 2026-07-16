from pydantic import BaseModel, ConfigDict, EmailStr

from app.models.enums import UserRole


class UserBase(BaseModel):
    email: EmailStr
    full_name: str
    role: UserRole = UserRole.student
    timezone: str = "UTC"
    max_weekly_hours: int | None = None


class UserCreate(UserBase):
    password: str


class UserUpdate(BaseModel):
    email: EmailStr | None = None
    full_name: str | None = None
    role: UserRole | None = None
    timezone: str | None = None
    password: str | None = None
    max_weekly_hours: int | None = None


class UserRead(UserBase):
    model_config = ConfigDict(from_attributes=True)
    id: int


class UserBrief(BaseModel):
    """Just enough to label a row (roster, class list).

    Deliberately excludes email and role: a teacher needs to put a name next to
    a grade, not to read the academy's user directory.
    """

    model_config = ConfigDict(from_attributes=True)
    id: int
    full_name: str
