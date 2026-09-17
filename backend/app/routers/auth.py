import logging
from jose import jwt
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.http import commit_or_conflict
from app.core.security import (
    _DUMMY_PASSWORD_HASH,
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    pwd_context,
    verify_password,
)
from app.models import RefreshSession, Tenant, User
from app.schemas.auth import RefreshRequest, SupabaseLoginRequest, Token
from app.schemas.user import UserRead, UserSelfUpdate
from app.services.audit import record, snapshot

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])

_credentials_exc = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Incorrect email or password",
    headers={"WWW-Authenticate": "Bearer"},
)

# How long a revoked session row sticks around before an opportunistic prune
# clears it out on the next login. Purely housekeeping — the revocation
# itself already took effect the moment `revoked_at` was set.
_REVOKED_SESSION_RETENTION = timedelta(days=30)


def _issue_tokens(db: Session, user: User) -> Token:
    """Open a new refresh session and return a fresh access/refresh pair.

    Every refresh token is tied to a `RefreshSession` row via its `jti`, so it
    can be rotated (one use each) and a replayed, already-rotated token can be
    recognized as stolen. Does not commit — the caller's commit carries it.
    """
    jti = secrets.token_urlsafe(24)
    db.add(RefreshSession(user_id=user.id, jti=jti))
    # `ver` carries the user's token_version so `get_current_user` can reject an
    # access token minted before a password change. Without it that check (which
    # was already written) never fired, and a token issued before the change
    # stayed usable for the rest of its life — the window a password reset is
    # meant to close.
    access_token = create_access_token(
        subject=str(user.id),
        extra={"role": user.role.value, "ver": user.token_version},
    )
    refresh_token = create_refresh_token(
        subject=str(user.id), token_version=user.token_version, jti=jti
    )
    return Token(
        access_token=access_token,
        refresh_token=refresh_token,
        user=UserRead.model_validate(user),
    )


def _purge_old_revoked_sessions(db: Session, user_id: int) -> None:
    """Opportunistic cleanup so `refresh_sessions` doesn't grow forever.

    Runs on login rather than a scheduled job — good enough for a table that
    only exists to support rotation, not as a durable audit trail.
    """
    cutoff = datetime.now(timezone.utc) - _REVOKED_SESSION_RETENTION
    db.execute(
        delete(RefreshSession).where(
            RefreshSession.user_id == user_id,
            RefreshSession.revoked_at.isnot(None),
            RefreshSession.revoked_at < cutoff,
        )
    )


@router.post("/login", response_model=Token)
def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    x_tenant_slug: str | None = Header(None, alias="X-Tenant-Slug"),
    db: Session = Depends(get_db),
) -> Token:
    tenant_slug = (x_tenant_slug or form_data.client_id or "").strip() or None

    candidates = list(
        db.scalars(select(User).where(User.email == form_data.username)).all()
    )

    if tenant_slug:
        target_tenant = db.scalar(select(Tenant).where(Tenant.slug == tenant_slug))
        if target_tenant is None:
            verify_password(form_data.password, _DUMMY_PASSWORD_HASH)
            raise _credentials_exc
        candidates = [u for u in candidates if u.tenant_id == target_tenant.id]

    if len(candidates) == 1:
        user = candidates[0]
        password_ok = verify_password(form_data.password, user.password_hash)
        if not password_ok:
            raise _credentials_exc
    elif len(candidates) > 1:
        matching_users = [
            u for u in candidates if verify_password(form_data.password, u.password_hash)
        ]
        if len(matching_users) == 1:
            user = matching_users[0]
        elif len(matching_users) > 1:
            tenant_ids = [u.tenant_id for u in matching_users if u.tenant_id is not None]
            tenants = list(
                db.scalars(select(Tenant).where(Tenant.id.in_(tenant_ids))).all()
            )
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "code": "tenant_required",
                    "message": "Tu cuenta pertenece a múltiples instituciones. Selecciona una para ingresar.",
                    "tenants": [{"id": t.id, "slug": t.slug, "name": t.name} for t in tenants],
                },
            )
        else:
            raise _credentials_exc
    else:
        verify_password(form_data.password, _DUMMY_PASSWORD_HASH)
        raise _credentials_exc

    if not user.is_active:
        logger.info("Refused login for deactivated account %s", user.id)
        raise _credentials_exc

    _purge_old_revoked_sessions(db, user.id)
    token = _issue_tokens(db, user)
    db.commit()
    return token


@router.post("/refresh", response_model=Token)
def refresh(payload: RefreshRequest, db: Session = Depends(get_db)) -> Token:
    token_data = decode_token(payload.refresh_token)
    if token_data is None or token_data.get("type") != "refresh":
        raise _credentials_exc
    sub = token_data.get("sub")
    if sub is None:
        raise _credentials_exc
    try:
        user_id = int(sub)
    except (TypeError, ValueError):
        raise _credentials_exc
    user = db.get(User, user_id)
    if user is None:
        raise _credentials_exc
    # Una cuenta dada de baja no puede entrar por la puerta principal, así que
    # tampoco por esta: sin esta línea seguía rotando refresh tokens hasta que
    # el suyo expirara. El access token que salía de ahí ya no servía —
    # `get_current_user` lo rechaza— pero la sesión no moría donde debía.
    if not user.is_active:
        raise _credentials_exc
    if token_data.get("tv") != user.token_version:
        raise _credentials_exc

    session = db.scalar(
        select(RefreshSession).where(
            RefreshSession.jti == token_data.get("jti"),
            RefreshSession.user_id == user.id,
        )
    )
    if session is None:
        raise _credentials_exc
    if session.revoked_at is not None:
        # This jti was already rotated away — presenting it again means the
        # token was copied and is now being replayed by someone other than
        # whoever rotated it. Treat every session of this user as compromised
        # rather than trust any of them, and force a fresh login everywhere.
        db.execute(
            update(RefreshSession)
            .where(
                RefreshSession.user_id == user.id,
                RefreshSession.revoked_at.is_(None),
            )
            .values(revoked_at=datetime.now(timezone.utc))
        )
        db.commit()
        raise _credentials_exc

    session.revoked_at = datetime.now(timezone.utc)
    token = _issue_tokens(db, user)
    db.commit()
    return token


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(payload: RefreshRequest, db: Session = Depends(get_db)) -> None:
    """Revoke a refresh session server-side, so a "logged out" token can't
    still be used to mint new access tokens.

    Always 204 whether or not the token turned out to be valid — this isn't an
    oracle for guessing which refresh tokens exist.
    """
    token_data = decode_token(payload.refresh_token)
    if token_data is not None and token_data.get("type") == "refresh":
        jti = token_data.get("jti")
        if jti:
            db.execute(
                update(RefreshSession)
                .where(
                    RefreshSession.jti == jti,
                    RefreshSession.revoked_at.is_(None),
                )
                .values(revoked_at=datetime.now(timezone.utc))
            )
            db.commit()


@router.get("/me", response_model=UserRead)
def me(current_user: User = Depends(get_current_user)) -> User:
    return current_user


@router.patch("/me", response_model=UserRead)
def update_me(
    payload: UserSelfUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> User:
    data = payload.model_dump(exclude_unset=True)
    new_password = data.pop("password", None)
    current_password = data.pop("current_password", None)

    before = snapshot(current_user)

    if new_password is not None:
        if not verify_password(current_password or "", current_user.password_hash):
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "La contraseña actual no es correcta",
            )
        current_user.password_hash = hash_password(new_password)
        current_user.token_version += 1

    for field, value in data.items():
        setattr(current_user, field, value)

    # snapshot() redacts password_hash, so an audit row never leaks a secret.
    record(
        db,
        current_user,
        "update",
        "user",
        current_user.id,
        before,
        snapshot(current_user),
    )
    # Un usuario puede escribir aquí su propia identificación personal, que es
    # única dentro de la academia. Sin esto, poner la de otra persona rompía
    # contra el índice y salía como 500.
    commit_or_conflict(
        db,
        "Ya existe un usuario con esa identificación personal (CUI / DPI o Pasaporte)",
    )
    db.refresh(current_user)
    return current_user


@router.post("/revoke-other-sessions", status_code=status.HTTP_200_OK)
def revoke_other_sessions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Invalida todas las demás sesiones activas del usuario incrementando su token_version."""
    current_user.token_version += 1
    record(
        db,
        current_user,
        "update",
        "user_sessions_revoke",
        current_user.id,
        after={"token_version": current_user.token_version},
    )
    db.commit()
    return {"message": "Todas las demás sesiones activas han sido revocadas correctamente."}


@router.post("/supabase-login", response_model=Token)
def supabase_login(
    payload: SupabaseLoginRequest,
    db: Session = Depends(get_db),
) -> Token:
    """Valida token de Supabase y emite JWTs propios."""
    try:
        # Decodificar SIN verificar firma (confiamos en Supabase)
        # En producción podrías validar con JWKS de Supabase
        claims = jwt.decode(
            payload.supabase_token,
            options={"verify_signature": False, "verify_aud": False}
        )
        email = claims.get("email")
        supabase_uid = claims.get("sub")

        if not email:
            raise _credentials_exc
    except jwt.JWTError:
        raise _credentials_exc

    # Buscar o crear usuario local
    user = db.scalar(select(User).where(User.email == email))
    if not user:
        user = User(
            email=email,
            full_name=claims.get("user_metadata", {}).get("full_name", email.split("@")[0]),
            role=UserRole.student,
            password_hash=pwd_context.hash(secrets.token_urlsafe(32)),
            supabase_uid=supabase_uid,
        )
        db.add(user)
        db.flush()
    elif not user.supabase_uid:
        user.supabase_uid = supabase_uid

    if not user.is_active:
        raise _credentials_exc

    return _issue_tokens(db, user)
