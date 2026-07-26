from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

_ALGORITHM = settings.jwt_algorithm
_SECRET = settings.jwt_secret

# Verified on every login attempt whose email doesn't match a user, so that
# "no such account" costs the same bcrypt work as "wrong password" — without
# this, a timing difference lets an attacker enumerate registered emails.
_DUMMY_PASSWORD_HASH = pwd_context.hash("educa-timing-guard-dummy-password")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(subject: str, extra: dict | None = None) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes)
    payload: dict = {"sub": subject, "exp": expire, "type": "access"}
    if extra:
        payload.update(extra)
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


def decode_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, _SECRET, algorithms=[_ALGORITHM])
    except JWTError:
        return None
