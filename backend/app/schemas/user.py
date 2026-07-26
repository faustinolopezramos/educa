from typing import Annotated, ClassVar

from pydantic import AfterValidator, BaseModel, ConfigDict, EmailStr, model_validator

from app.models.enums import UserRole
from app.schemas.base import PatchModel

PASSWORD_MIN_LENGTH = 8
# bcrypt hashes at most 72 bytes and silently ignores the rest, which would make
# two different passwords sharing a 72-byte prefix interchangeable at login.
# Reject those up front rather than accept a password we cannot fully check.
BCRYPT_MAX_BYTES = 72


def _validate_password(value: str) -> str:
    if len(value) < PASSWORD_MIN_LENGTH:
        raise ValueError(
            f"La contraseña debe tener al menos {PASSWORD_MIN_LENGTH} caracteres"
        )
    if len(value.encode("utf-8")) > BCRYPT_MAX_BYTES:
        raise ValueError(f"La contraseña no puede superar {BCRYPT_MAX_BYTES} bytes")
    return value


Password = Annotated[str, AfterValidator(_validate_password)]


class UserBase(BaseModel):
    email: EmailStr
    full_name: str
    role: UserRole = UserRole.student
    timezone: str = "UTC"
    max_weekly_hours: int | None = None
    phone: str | None = None
    address: str | None = None
    nationality_id: int | None = None


class UserCreate(UserBase):
    password: Password


class UserUpdate(PatchModel):
    # max_weekly_hours is nullable on purpose: null means "uncapped".
    NON_NULLABLE: ClassVar[tuple[str, ...]] = (
        "email",
        "full_name",
        "role",
        "timezone",
        "password",
    )
    email: EmailStr | None = None
    full_name: str | None = None
    role: UserRole | None = None
    timezone: str | None = None
    password: Password | None = None
    max_weekly_hours: int | None = None
    phone: str | None = None
    address: str | None = None
    nationality_id: int | None = None


class UserSelfUpdate(PatchModel):
    """What a user may change about their own profile.

    Deliberately narrower than UserUpdate: no role, email, or
    max_weekly_hours — those stay admin-only. A password change must be
    accompanied by the current password, since the caller is proving it's
    really them and not an admin resetting a forgotten one.
    """

    NON_NULLABLE: ClassVar[tuple[str, ...]] = ("full_name", "timezone", "password")
    full_name: str | None = None
    timezone: str | None = None
    password: Password | None = None
    current_password: str | None = None
    phone: str | None = None
    address: str | None = None
    nationality_id: int | None = None

    @model_validator(mode="after")
    def _password_requires_current(self) -> "UserSelfUpdate":
        if self.password is not None and not self.current_password:
            raise ValueError(
                "Debes indicar tu contraseña actual para establecer una nueva"
            )
        return self


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
