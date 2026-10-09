from typing import Annotated
from datetime import datetime

from pydantic import AfterValidator, BaseModel, ConfigDict, Field

from app.schemas.user import Email, Password, UserRead
from app.services.currencies import DEFAULT_CURRENCY, validate_currency


class MFASetupResponse(BaseModel):
    """Respuesta al iniciar configuración de MFA."""
    secret: str
    qr_code_svg: str
    backup_codes: list[str]
    otpauth_url: str


class MFAEnableRequest(BaseModel):
    """Solicitud para activar MFA tras verificar el primer token."""
    token: str = Field(..., min_length=6, max_length=8)


class MFAVerifyRequest(BaseModel):
    """Solicitud de verificación MFA durante login."""
    token: str = Field(..., min_length=6, max_length=8)


class MFADisableRequest(BaseModel):
    """Solicitud para desactivar MFA."""
    password: str
    token: str | None = Field(None, min_length=6, max_length=8)


class MFARegenerateBackupCodesResponse(BaseModel):
    """Nuevos códigos de respaldo generados."""
    backup_codes: list[str]


class MFAChallengeResponse(BaseModel):
    """Respuesta cuando se requiere MFA: token temporal y flag."""
    mfa_required: bool = True
    temp_token: str
    message: str = "Se requiere autenticación de dos factores"


class Token(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserRead


class SelfUpdateResult(UserRead):
    """El perfil tras editarlo, y un par de tokens nuevo si cambió la contraseña.

    Cambiar la contraseña invalida todos los tokens anteriores, también los de
    esta misma sesión; sin un par nuevo, quien acababa de cambiarla era
    expulsado en su siguiente petición.
    """

    tokens: Token | None = None


class RefreshRequest(BaseModel):
    refresh_token: str


class SupabaseLoginRequest(BaseModel):
    supabase_token: str


class AcademyRegisterRequest(BaseModel):
    academy_name: str = Field(..., min_length=2, max_length=150)
    slug: str = Field(..., min_length=2, max_length=50, pattern="^[a-z0-9-]+$")
    admin_name: str = Field(..., min_length=2, max_length=255)
    admin_email: Email
    password: Password
    phone: str | None = Field(None, max_length=50)
    plan_tier: str = Field("free", max_length=50)
    # Quien crea la academia acepta los Términos y la Política de Privacidad en
    # su nombre. Sin esa aceptación no se crea.
    accept_terms: bool = False
    # La moneda en que la academia cobra a sus alumnos; la decide el director.
    currency: Annotated[str, AfterValidator(validate_currency)] = DEFAULT_CURRENCY


# ---------- Device Session schemas ----------


class DeviceSessionRead(BaseModel):
    """Sesión de dispositivo visible para el usuario."""
    model_config = ConfigDict(from_attributes=True)

    id: int
    device_name: str | None
    ip_address: str | None
    location: str | None
    created_at: datetime
    last_used_at: datetime
    is_current: bool


class DeviceSessionListResponse(BaseModel):
    """Lista de sesiones de dispositivo."""
    sessions: list[DeviceSessionRead]


class RevokeSessionRequest(BaseModel):
    """Solicitud para revocar una sesión."""
    session_id: int


class RevokeAllOtherSessionsResponse(BaseModel):
    """Respuesta al revocar todas las demás sesiones."""
    revoked_count: int
    message: str


# ---------- WebAuthn / Passkey schemas ----------


class WebAuthnCredentialRead(BaseModel):
    """Credencial WebAuthn (passkey) visible para el usuario."""
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str | None
    authenticator_type: str | None
    transports: str | None
    created_at: datetime
    last_used_at: datetime | None


class WebAuthnCredentialListResponse(BaseModel):
    """Lista de credenciales WebAuthn."""
    credentials: list[WebAuthnCredentialRead]


class WebAuthnRegisterStartRequest(BaseModel):
    """Solicitud para iniciar registro de passkey."""
    pass


class WebAuthnRegisterStartResponse(BaseModel):
    """Opciones de registro WebAuthn (JSON serializado)."""
    options: str  # JSON string de PublicKeyCredentialCreationOptions


class WebAuthnRegisterFinishRequest(BaseModel):
    """Solicitud para completar registro de passkey."""
    credential: dict  # PublicKeyCredential del navegador
    challenge: str


class WebAuthnAuthenticateStartRequest(BaseModel):
    """Solicitud para iniciar autenticación con passkey."""
    pass


class WebAuthnAuthenticateStartResponse(BaseModel):
    """Opciones de autenticación WebAuthn (JSON serializado)."""
    options: str  # JSON string de PublicKeyCredentialRequestOptions


class WebAuthnAuthenticateFinishRequest(BaseModel):
    """Solicitud para completar autenticación con passkey."""
    credential: dict  # PublicKeyCredential del navegador
    challenge: str


class WebAuthnAuthenticateFinishResponse(BaseModel):
    """Respuesta tras autenticación exitosa con passkey."""
    token: Token | MFAChallengeResponse
    message: str = "Autenticación con passkey exitosa"


class ForgotPasswordRequest(BaseModel):
    """Solicitud de recuperación de contraseña."""
    email: Email
    tenant_slug: str | None = None


class ResetPasswordRequest(BaseModel):
    """Solicitud para restablecer la contraseña con un token válido."""
    token: str
    new_password: Password


class MessageResponse(BaseModel):
    """Respuesta informativa estándar."""
    message: str

