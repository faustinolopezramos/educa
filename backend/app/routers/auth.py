import logging
import secrets
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user, tenant_suspended
from app.core.http import commit_or_conflict
from app.core.security import (
    _DUMMY_PASSWORD_HASH,
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.models import RefreshSession, Tenant, User
from app.schemas.auth import RefreshRequest, SupabaseLoginRequest, Token
from app.schemas.user import UserRead, UserSelfUpdate
from app.services import supabase_auth
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


def _narrow_to_tenant(
    db: Session, candidates: list[User], tenant_slug: str | None
) -> list[User]:
    """Los candidatos que pertenecen a la academia indicada.

    Una academia desconocida deja la lista vacía, que quien llama trata igual
    que "no hay tal cuenta": decir "esa academia no existe" ya cuenta algo a
    quien sólo está probando nombres.
    """
    if not tenant_slug:
        return candidates
    target_tenant = db.scalar(select(Tenant).where(Tenant.slug == tenant_slug))
    if target_tenant is None:
        return []
    return [u for u in candidates if u.tenant_id == target_tenant.id]


def _tenant_required_exc(db: Session, users: list[User]) -> HTTPException:
    """409 pidiendo al cliente que elija academia.

    El mismo correo puede existir en varias academias. Cuando las credenciales
    valen para más de una, la única forma de saber a cuál entra es preguntar.
    """
    tenant_ids = [u.tenant_id for u in users if u.tenant_id is not None]
    tenants = list(db.scalars(select(Tenant).where(Tenant.id.in_(tenant_ids))).all())
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail={
            "code": "tenant_required",
            "message": "Tu cuenta pertenece a múltiples instituciones. Selecciona una para ingresar.",
            "tenants": [{"id": t.id, "slug": t.slug, "name": t.name} for t in tenants],
        },
    )


def _refuse_if_suspended(db: Session, user: User) -> None:
    """403 con el motivo, para quien ya demostró ser de la academia.

    Se comprueba después de la contraseña: decir "esta academia está
    suspendida" a quien sólo prueba correos confirmaría que la cuenta existe.
    """
    if tenant_suspended(db, user):
        logger.info("Refused login for account %s: academy suspended", user.id)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Tu academia está suspendida en la plataforma. Contacta con su "
                "dirección o con el administrador de Educa."
            ),
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

    candidates = _narrow_to_tenant(db, candidates, tenant_slug)

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
            raise _tenant_required_exc(db, matching_users)
        else:
            raise _credentials_exc
    else:
        verify_password(form_data.password, _DUMMY_PASSWORD_HASH)
        raise _credentials_exc

    if not user.is_active:
        logger.info("Refused login for deactivated account %s", user.id)
        raise _credentials_exc
    _refuse_if_suspended(db, user)

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
    if not user.is_active or tenant_suspended(db, user):
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
    x_tenant_slug: str | None = Header(None, alias="X-Tenant-Slug"),
    db: Session = Depends(get_db),
) -> Token:
    """Canjea un token de Supabase Auth por una sesión propia de Educa.

    El token se comprueba contra Supabase (ver `services.supabase_auth`), nunca
    leyéndolo sin más: lo que el cliente manda dice quién *afirma* ser.

    Este endpoint **no crea cuentas**. Da acceso a un usuario que ya existe en
    la academia y está activo; quién entra y con qué rol se decide dando de alta
    a la persona, no iniciando sesión. Antes, un correo desconocido se convertía
    en un alumno nuevo, así que cualquiera que pudiera registrarse en Supabase
    tenía cuenta aquí.
    """
    if not supabase_auth.is_configured():
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "El inicio de sesión con Supabase no está configurado en este servidor",
        )

    try:
        supabase_user = supabase_auth.fetch_supabase_user(payload.supabase_token)
    except httpx.HTTPError as exc:
        # No haber podido preguntar no es lo mismo que un token inválido: un 401
        # aquí echaría a un usuario legítimo por un corte de red.
        logger.warning("No se pudo validar el token contra Supabase: %s", exc)
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "No se pudo verificar la sesión con Supabase. Inténtalo de nuevo.",
        )

    if supabase_user is None:
        raise _credentials_exc

    # Enlazar por correo sólo tiene sentido si Supabase confirmó que la persona
    # lo controla. Sin esta comprobación, registrarse con el correo de otro basta
    # para quedarse con su cuenta de Educa.
    if not supabase_user.email_confirmed:
        logger.info("Token de Supabase con correo sin confirmar: %s", supabase_user.email)
        raise _credentials_exc

    # Primero por el identificador de Supabase, que es el vínculo estable y ya
    # tiene índice único; el correo sólo para el primer enlace.
    user = db.scalar(select(User).where(User.supabase_uid == supabase_user.uid))

    if user is None:
        tenant_slug = (x_tenant_slug or "").strip() or None
        candidates = list(
            db.scalars(
                select(User).where(func.lower(User.email) == supabase_user.email)
            ).all()
        )
        candidates = _narrow_to_tenant(db, candidates, tenant_slug)

        if len(candidates) > 1:
            raise _tenant_required_exc(db, candidates)
        if not candidates:
            logger.info("Supabase validó a %s, que no tiene cuenta local", supabase_user.email)
            raise _credentials_exc

        user = candidates[0]
        if user.supabase_uid and user.supabase_uid != supabase_user.uid:
            # La cuenta ya está enlazada a otra identidad de Supabase. Reenlazar
            # en silencio dejaría entrar a quien registre ese mismo correo.
            logger.warning("Cuenta %s ya enlazada a otro usuario de Supabase", user.id)
            raise _credentials_exc
        user.supabase_uid = supabase_user.uid

    if not user.is_active:
        logger.info("Refused Supabase login for deactivated account %s", user.id)
        raise _credentials_exc
    _refuse_if_suspended(db, user)

    _purge_old_revoked_sessions(db, user.id)
    token = _issue_tokens(db, user)
    # Sin este commit la sesión de refresh nunca llegaba a la base: el usuario
    # recibía un refresh token cuyo `jti` no existía, y el primer intento de
    # renovar la sesión lo echaba fuera.
    db.commit()
    return token
