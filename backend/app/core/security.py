from datetime import datetime, timedelta, timezone

import secrets

import bcrypt
import jwt

from app.core.config import settings

# bcrypt sólo mira los primeros 72 bytes. passlib los recortaba en silencio y
# así se guardaron los hashes existentes; bcrypt 5 en cambio lanza un error con
# una entrada más larga. Se recorta igual que antes para que ambos lados sigan
# coincidiendo con lo ya guardado.
_BCRYPT_MAX_BYTES = 72


def _bcrypt_input(password: str) -> bytes:
    return password.encode("utf-8")[:_BCRYPT_MAX_BYTES]

_ALGORITHM = settings.jwt_algorithm
_SECRET = settings.jwt_secret

# Verified on every login attempt whose email doesn't match a user, so that
# "no such account" costs the same bcrypt work as "wrong password" — without
# this, a timing difference lets an attacker enumerate registered emails.
def hash_password(password: str) -> str:
    return bcrypt.hashpw(_bcrypt_input(password), bcrypt.gensalt()).decode("ascii")


_DUMMY_PASSWORD_HASH = hash_password("educa-timing-guard-dummy-password")


def generate_password() -> str:
    """Una contraseña inicial distinta para cada cuenta nueva.

    Sustituye a la contraseña fija que se sugería al dar de alta, que estaba
    publicada en el propio JavaScript: sabiendo el correo de alguien se entraba
    en su cuenta. 12 caracteres URL-safe, muy por debajo del límite de bcrypt.
    """
    return secrets.token_urlsafe(9)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(_bcrypt_input(plain_password), hashed_password.encode("ascii"))
    except (ValueError, UnicodeEncodeError):
        # Un hash que no es bcrypt no puede validar ninguna contraseña.
        return False


def create_access_token(subject: str, extra: dict | None = None) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes)
    payload: dict = {"sub": subject, "exp": expire, "type": "access"}
    if extra:
        payload.update(extra)
    return jwt.encode(payload, _SECRET, algorithm=_ALGORITHM)


# Lo que dura el desafío de segundo factor: el tiempo para abrir la app
# autenticadora y teclear el código, no más.
MFA_CHALLENGE_EXPIRE_MINUTES = 5


def create_mfa_challenge_token(subject: str, role: str, token_version: int) -> str:
    """Token del desafío MFA: lo que se entrega tras acertar la contraseña.

    Lleva `type: "mfa"`, no `"access"`, a propósito. Cuando era un access token
    con una marca `mfa_pending`, `get_current_user` lo aceptaba en cualquier
    endpoint —nadie miraba la marca— y bastaba la contraseña para entrar. Con un
    tipo propio, `get_current_user` lo rechaza como a cualquier token ajeno, y
    sólo `/auth/mfa/verify` sabe canjearlo.
    """
    expire = datetime.now(timezone.utc) + timedelta(minutes=MFA_CHALLENGE_EXPIRE_MINUTES)
    payload: dict = {
        "sub": subject,
        "exp": expire,
        "type": "mfa",
        "role": role,
        "ver": token_version,
    }
    return jwt.encode(payload, _SECRET, algorithm=_ALGORITHM)


def create_refresh_token(subject: str, token_version: int, jti: str) -> str:
    """`jti` ties this token to its `RefreshSession` row, so it can be rotated
    (one use each) and a replayed, already-rotated `jti` can be recognized as
    a stolen token being reused."""
    expire = datetime.now(timezone.utc) + timedelta(
        days=settings.refresh_token_expire_days
    )
    payload: dict = {
        "sub": subject,
        "exp": expire,
        "type": "refresh",
        "tv": token_version,
        "jti": jti,
    }
    return jwt.encode(payload, _SECRET, algorithm=_ALGORITHM)


def create_password_reset_token(
    subject: str, token_version: int, expire_minutes: int = 30
) -> str:
    """Emite un token firmado para recuperación de contraseña (30 min por defecto)."""
    expire = datetime.now(timezone.utc) + timedelta(minutes=expire_minutes)
    payload: dict = {
        "sub": subject,
        "exp": expire,
        "type": "password_reset",
        "tv": token_version,
    }
    return jwt.encode(payload, _SECRET, algorithm=_ALGORITHM)


def decode_token(token: str) -> dict | None:
    try:
        # `exp` y `sub` obligatorios: un token firmado sin caducidad no caduca nunca.
        return jwt.decode(
            token,
            _SECRET,
            algorithms=[_ALGORITHM],
            options={"require": ["exp", "sub"]},
        )
    except jwt.PyJWTError:
        return None
