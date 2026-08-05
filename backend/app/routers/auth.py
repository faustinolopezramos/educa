import logging
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
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
    verify_password,
)
from app.models import RefreshSession, User
from app.schemas.auth import RefreshRequest, Token
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
    db: Session = Depends(get_db),
) -> Token:
    # Emails are unique per tenant, not globally (`uq_users_tenant_email`), so
    # an address can legitimately exist in two academies. There is no tenant in
    # a login request to disambiguate with — and taking one from the client
    # would let the caller choose whose account to authenticate against — so an
    # ambiguous address is refused rather than resolved arbitrarily.
    candidates = list(
        db.scalars(select(User).where(User.email == form_data.username)).all()
    )
    user = candidates[0] if len(candidates) == 1 else None
    if len(candidates) > 1:
        logger.warning(
            "Refused login for %s: the address exists in %d tenants",
            form_data.username,
            len(candidates),
        )
    # Always run verify_password, even for an unknown or ambiguous email:
    # comparing against a dummy hash keeps this branch's timing
    # indistinguishable from a wrong password on a real account, so response
    # time can't be used to enumerate registered emails.
    password_hash = user.password_hash if user is not None else _DUMMY_PASSWORD_HASH
    password_ok = verify_password(form_data.password, password_hash)
    if user is None or not password_ok:
        raise _credentials_exc
    # A deactivated account keeps its rows — its grades, its classes, its trail
    # — but stops being a way in. Same generic error as a wrong password: which
    # accounts have been switched off is not something a stranger gets to probe.
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
