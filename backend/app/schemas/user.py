from typing import Annotated, ClassVar

from pydantic import AfterValidator, BaseModel, ConfigDict, EmailStr, model_validator

from app.models.enums import Permission, UserRole
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


# --- Identificación personal (DPI/CUI, pasaporte, DNI o documento extranjero) ---
IDENTITY_MIN_LENGTH = 4
IDENTITY_MAX_LENGTH = 25


def normalize_cui_passport(value: str) -> str:
    """La forma canónica: sólo alfanuméricos, en mayúsculas."""
    return "".join(ch for ch in value if ch.isalnum()).upper()


def _validate_cui_passport(value: str) -> str:
    canonical = normalize_cui_passport(value)
    if not canonical:
        raise ValueError(
            "La identificación personal (CUI / DPI, Pasaporte o DNI) es obligatoria"
        )
    if not (IDENTITY_MIN_LENGTH <= len(canonical) <= IDENTITY_MAX_LENGTH):
        raise ValueError(
            f"El documento de identificación debe contener entre {IDENTITY_MIN_LENGTH} y "
            f"{IDENTITY_MAX_LENGTH} caracteres alfanuméricos"
        )
    return canonical


CuiPassport = Annotated[str, AfterValidator(_validate_cui_passport)]


class UserBase(BaseModel):
    tenant_id: int | None = None
    email: EmailStr
    full_name: str
    role: UserRole = UserRole.student
    timezone: str = "UTC"
    max_weekly_hours: int | None = None
    phone: str | None = None
    address: str | None = None
    cui_passport: str | None = None
    nationality_id: int | None = None
    # Whether the account may be used. "Baja" is this flag rather than a DELETE:
    # a teacher's schedules, grades and attendance have to survive them.
    is_active: bool = True
    # Deliberately loose on the *read* side. The column is plain JSON, so an
    # installation that predates the enum may hold a string no longer in it —
    # and a strict type here would turn that stale row into a 500 on the user
    # list rather than a permission that simply grants nothing. Writes are
    # validated against `Permission` below.
    permissions: list[str] | None = None


class UserCreate(UserBase):
    cui_passport: CuiPassport
    password: Password
    permissions: list[Permission] | None = None


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
    cui_passport: CuiPassport | None = None
    nationality_id: int | None = None
    is_active: bool | None = None
    permissions: list[Permission] | None = None


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
    cui_passport: CuiPassport | None = None
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
