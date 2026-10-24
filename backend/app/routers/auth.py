import logging
import secrets
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user, tenant_suspended
from app.core.http import client_ip, commit_or_conflict
from app.core.security import (
    _DUMMY_PASSWORD_HASH,
    create_access_token,
    create_mfa_challenge_token,
    create_password_reset_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.models import RefreshSession, Tenant, User, UserRole
from app.schemas.auth import (
    AcademyRegisterRequest,
    ForgotPasswordRequest,
    MessageResponse,
    MFAChallengeResponse,
    RefreshRequest,
    ResetPasswordRequest,
    SelfUpdateResult,
    SupabaseLoginRequest,
    Token,
)
from app.schemas.user import UserRead, UserSelfUpdate, normalize_email
from app.services import supabase_auth, tenant_plans, account_lockout, device_sessions, login_notifications, password_breach, email as email_service
from app.services.legal import LEGAL_VERSION
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

# El plan con el que nace toda academia registrada por su cuenta.
FREE_TIER_NAME = "free"
FREE_TIER_MAX_STUDENTS = 15


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
    # `sid` es el `jti` de su sesión de refresco: identifica «esta sesión» para
    # poder cerrar todas las demás sin cerrar la actual.
    access_token = create_access_token(
        subject=str(user.id),
        extra={"role": user.role.value, "ver": user.token_version, "sid": jti},
    )
    refresh_token = create_refresh_token(
        subject=str(user.id), token_version=user.token_version, jti=jti
    )
    return Token(
        access_token=access_token,
        refresh_token=refresh_token,
        user=UserRead.model_validate(user),
    )


def _issue_mfa_temp_token(user: User) -> str:
    """Emite el token del desafío MFA (5 min, `type: "mfa"`).

    No crea RefreshSession y no sirve en ningún endpoint salvo `/mfa/verify`.
    """
    return create_mfa_challenge_token(
        subject=str(user.id), role=user.role.value, token_version=user.token_version
    )


def _mfa_locked_exc(user_id: int) -> HTTPException:
    status_ = account_lockout.check_mfa_lockout(user_id)
    retry_after = (
        max(1, int((status_.lockout_until - datetime.now(timezone.utc)).total_seconds()))
        if status_.lockout_until
        else 900
    )
    return HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail={
            "code": "mfa_locked",
            "message": f"Demasiados códigos incorrectos. Intenta de nuevo en {max(1, retry_after // 60)} minutos.",
            "retry_after_seconds": retry_after,
        },
        headers={"Retry-After": str(retry_after)},
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


def _get_client_ip(request: Request) -> str:
    """IP del cliente, con la misma regla que el limitador de la API."""
    return client_ip(request)


def _retry_after_seconds(until: datetime | None) -> int:
    if until is None:
        return 900
    return max(1, int((until - datetime.now(timezone.utc)).total_seconds()))


def _raise_if_ip_locked(ip: str) -> None:
    lock = account_lockout.check_ip_lockout(ip)
    if not lock.is_locked:
        return
    retry_after = _retry_after_seconds(lock.lockout_until)
    raise HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail={
            "code": "ip_locked",
            "message": f"Demasiados intentos fallidos desde esta IP. Intenta de nuevo en {max(1, retry_after // 60)} minutos.",
            "retry_after_seconds": retry_after,
        },
        headers={"Retry-After": str(retry_after)},
    )


def _raise_if_email_locked(email: str) -> None:
    """El bloqueo de un correo sin cuenta, con la misma respuesta que el de una real."""
    _raise_if_locked(account_lockout.check_email_lockout(email))


def _raise_if_user_locked(user_id: int) -> None:
    _raise_if_locked(account_lockout.check_user_lockout(user_id))


def _raise_if_locked(lock: "account_lockout.LockoutStatus") -> None:
    if not lock.is_locked:
        return
    retry_after = _retry_after_seconds(lock.lockout_until)
    raise HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail={
            "code": "account_locked",
            "message": f"Cuenta bloqueada temporalmente por intentos fallidos. Intenta de nuevo en {max(1, retry_after // 60)} minutos.",
            "retry_after_seconds": retry_after,
        },
        headers={"Retry-After": str(retry_after)},
    )


def register_device(
    db: Session, user: User, request: Request | None, token: Token, method: str | None = None
) -> None:
    """Anota el dispositivo de una sesión recién abierta y avisa si es nuevo.

    Se llama con los tokens ya emitidos, para guardar el `jti` verdadero de la
    sesión (antes se guardaba uno provisional y se corregía después, y en el
    camino MFA no se corregía nunca). Corre en un savepoint y nunca hace fallar
    el acceso: es información de seguridad, no parte de la autenticación.
    """
    if request is None:
        return
    jti = device_sessions.extract_jti_from_refresh_token(token.refresh_token)
    if not jti:
        return
    user_agent = request.headers.get("user-agent")
    ip = _get_client_ip(request)
    try:
        with db.begin_nested():
            session = device_sessions.create_device_session(
                db, user, refresh_jti=jti, user_agent=user_agent, ip=ip
            )
            login_notifications.send_new_login_notification(
                db, user, user_agent, ip, method or session.device_name, None
            )
    except Exception as exc:
        logger.warning("No se pudo registrar la sesión de dispositivo: %s", exc)


@router.post("/login", response_model=Token | MFAChallengeResponse)
def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    x_tenant_slug: str | None = Header(None, alias="X-Tenant-Slug"),
    request: Request = None,
    db: Session = Depends(get_db),
) -> Token | MFAChallengeResponse:
    tenant_slug = (x_tenant_slug or form_data.client_id or "").strip() or None
    client_ip = _get_client_ip(request) if request else "unknown"

    _raise_if_ip_locked(client_ip)

    candidates = list(
        db.scalars(
            select(User).where(User.email == normalize_email(form_data.username))
        ).all()
    )
    candidates = _narrow_to_tenant(db, candidates, tenant_slug)

    if len(candidates) == 1:
        user = candidates[0]
        _raise_if_user_locked(user.id)
        if not verify_password(form_data.password, user.password_hash):
            account_lockout.record_failed_login(client_ip, user.id)
            raise _credentials_exc
    elif len(candidates) > 1:
        matching_users = [
            u for u in candidates if verify_password(form_data.password, u.password_hash)
        ]
        if len(matching_users) > 1:
            raise _tenant_required_exc(db, matching_users)
        if not matching_users:
            # Ninguna cuenta con ese correo acepta la contraseña: se cuenta
            # contra cada una, para que adivinar no salga gratis por repartirse.
            for candidate in candidates:
                account_lockout.record_failed_login(client_ip, candidate.id)
            raise _credentials_exc
        user = matching_users[0]
        _raise_if_user_locked(user.id)
    else:
        # Un correo sin cuenta se bloquea igual que uno con cuenta: si no, el 429
        # sólo aparecería para los que existen.
        email = normalize_email(form_data.username)
        _raise_if_email_locked(email)
        verify_password(form_data.password, _DUMMY_PASSWORD_HASH)
        account_lockout.record_failed_login(client_ip, unknown_email=email)
        raise _credentials_exc

    if not user.is_active:
        logger.info("Refused login for deactivated account %s", user.id)
        raise _credentials_exc
    _refuse_if_suspended(db, user)

    account_lockout.clear_lockouts(client_ip, user.id)

    # Con MFA, la contraseña sola no abre sesión: ni sesión de dispositivo ni
    # aviso de «nuevo acceso» hasta que se acierte el segundo factor.
    if user.mfa_enabled:
        return MFAChallengeResponse(temp_token=_issue_mfa_temp_token(user))

    _purge_old_revoked_sessions(db, user.id)
    token = _issue_tokens(db, user)
    register_device(db, user, request, token)
    db.commit()
    return token


@router.post(
    "/register-academy",
    response_model=Token,
    status_code=status.HTTP_201_CREATED,
)
def register_academy(
    payload: AcademyRegisterRequest,
    db: Session = Depends(get_db),
) -> Token:
    """Self-service onboarding: creates a new academy tenant and primary admin account."""
    if not payload.accept_terms:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Para crear la academia hay que aceptar los Términos y Condiciones y la "
            "Política de Privacidad.",
        )
    slug = payload.slug.strip().lower()
    existing_tenant = db.scalar(select(Tenant).where(Tenant.slug == slug))
    if existing_tenant is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="El subdominio o identificador ya está en uso. Por favor elige otro.",
        )

    # Toda academia nace en el plan gratuito. El plan que se eligió en el
    # formulario sólo queda anotado en la auditoría como "solicitado": darle el
    # cupo de ese plan aquí, sin cobro de por medio, regalaba el plan más caro a
    # quien lo marcara. El superadmin lo sube al confirmar el pago.
    requested_plan = payload.plan_tier.strip().lower()
    max_students = FREE_TIER_MAX_STUDENTS

    # Verificar si la contraseña ha sido comprometida en breaches conocidos
    breach_result = password_breach.check_password_breach_sync(payload.password)
    if breach_result.compromised:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "password_pwned",
                "message": (
                    f"Esta contraseña aparece en {breach_result.count} filtraciones de datos conocidos. "
                    "Por seguridad, elige una contraseña diferente."
                ),
                "breach_count": breach_result.count,
            },
        )

    tenant = Tenant(
        name=payload.academy_name.strip(),
        slug=slug,
        plan_tier=FREE_TIER_NAME,
        currency=payload.currency,
        max_active_students=max_students,
        phone=payload.phone.strip() if payload.phone else None,
        is_active=True,
    )
    db.add(tenant)
    db.flush()

    admin_user = User(
        tenant_id=tenant.id,
        email=str(payload.admin_email).strip().lower(),
        full_name=payload.admin_name.strip(),
        password_hash=hash_password(payload.password),
        role=UserRole.admin,
        phone=payload.phone.strip() if payload.phone else None,
        is_active=True,
        notify_email=True,
        terms_version=LEGAL_VERSION,
        terms_accepted_at=datetime.now(timezone.utc),
    )
    db.add(admin_user)
    db.flush()

    record(
        db,
        admin_user,
        "create",
        "tenant",
        tenant.id,
        None,
        {
            "name": tenant.name,
            "slug": tenant.slug,
            "plan_tier": FREE_TIER_NAME,
            "requested_plan": requested_plan,
            "max_active_students": max_students,
            "admin_email": admin_user.email,
            "terms_version": LEGAL_VERSION,
        },
    )

    # El plan de pago elegido queda pendiente para el superadmin, que lo activa
    # al confirmar el pago.
    tenant_plans.note_registration_request(db, tenant, requested_plan)

    token = _issue_tokens(db, admin_user)
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
        # Un dispositivo que su dueño cerró a propósito no es un robo: se le
        # niega la renovación y nada más. Si se tratara como reutilización, el
        # token de un teléfono extraviado, al intentar renovar, cerraría también
        # el resto de sesiones legítimas.
        if device_sessions.is_explicitly_revoked(db, user.id, session.jti):
            raise _credentials_exc
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
    # La sesión de dispositivo sigue a su refresh token: sin esto, tras la primera
    # renovación quedaba apuntando a un `jti` ya gastado y dejaba de poder cerrarse.
    new_jti = device_sessions.extract_jti_from_refresh_token(token.refresh_token)
    if new_jti:
        device_sessions.rotate_device_session(db, user.id, token_data.get("jti"), new_jti)
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


def _revoke_all_refresh_sessions(db: Session, user: User) -> None:
    """Cierra en el servidor todas las sesiones de refresh abiertas del usuario."""
    db.execute(
        update(RefreshSession)
        .where(
            RefreshSession.user_id == user.id,
            RefreshSession.revoked_at.is_(None),
        )
        .values(revoked_at=datetime.now(timezone.utc))
    )


@router.patch("/me", response_model=SelfUpdateResult)
def update_me(
    payload: UserSelfUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SelfUpdateResult:
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

        # Verificar si la nueva contraseña ha sido comprometida
        breach_result = password_breach.check_password_breach_sync(new_password)
        if breach_result.compromised:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={
                    "code": "password_pwned",
                    "message": (
                        f"Esta contraseña aparece en {breach_result.count} filtraciones de datos conocidos. "
                        "Por seguridad, elige una contraseña diferente."
                    ),
                    "breach_count": breach_result.count,
                },
            )

        current_user.password_hash = hash_password(new_password)
        current_user.token_version += 1
        _revoke_all_refresh_sessions(db, current_user)

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
    # Las demás sesiones mueren con el cambio de contraseña; ésta sigue con un
    # par nuevo, emitido ya con la versión de token actualizada.
    tokens = _issue_tokens(db, current_user) if new_password is not None else None
    # Un usuario puede escribir aquí su propia identificación personal, que es
    # única dentro de la academia. Sin esto, poner la de otra persona rompía
    # contra el índice y salía como 500.
    commit_or_conflict(
        db,
        "Ya existe un usuario con esa identificación personal (CUI / DPI o Pasaporte)",
    )
    db.refresh(current_user)
    result = SelfUpdateResult.model_validate(current_user)
    if tokens is not None:
        # `_issue_tokens` serializó al usuario antes del commit; se actualiza.
        tokens.user = UserRead.model_validate(current_user)
    return result.model_copy(update={"tokens": tokens})


@router.post("/revoke-other-sessions", response_model=Token)
def revoke_other_sessions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Token:
    """Cierra todas las demás sesiones del usuario y mantiene abierta ésta.

    Subir `token_version` invalida todos los tokens emitidos, también los de
    quien lo pide; por eso se le devuelve un par nuevo. Antes respondía sólo un
    mensaje y la propia sesión caía en la siguiente petición.
    """
    current_user.token_version += 1
    _revoke_all_refresh_sessions(db, current_user)
    record(
        db,
        current_user,
        "update",
        "user_sessions_revoke",
        current_user.id,
        after={"token_version": current_user.token_version},
    )
    token = _issue_tokens(db, current_user)
    db.commit()
    return token


@router.post("/supabase-login", response_model=Token | MFAChallengeResponse)
def supabase_login(
    payload: SupabaseLoginRequest,
    x_tenant_slug: str | None = Header(None, alias="X-Tenant-Slug"),
    request: Request = None,
    db: Session = Depends(get_db),
) -> Token | MFAChallengeResponse:
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
        # Se comprueba antes de buscar cuentas, así que el aviso no dice nada
        # sobre si ese correo existe en EDUCA.
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            {
                "code": "email_unverified",
                "message": (
                    "Tu proveedor no confirmó que el correo sea tuyo, así que no "
                    "podemos usarlo para entrar. Entra con tu correo y contraseña."
                ),
            },
        )

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
            # A diferencia del login con contraseña, aquí se puede decir: quien
            # pregunta acaba de demostrar ante Google/Microsoft/Apple que el
            # correo es suyo, así que no se revela nada de una cuenta ajena.
            # Y sin este aviso, entrar con Google con otro correo terminaba en
            # un "contraseña incorrecta" que no tenía nada que ver.
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                {
                    "code": "no_account",
                    "email": supabase_user.email,
                    "message": (
                        f"El correo {supabase_user.email} no tiene cuenta en EDUCA. "
                        "Pide a tu academia que te dé de alta con este correo, o "
                        "entra con el correo que tienes registrado."
                    ),
                },
            )

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

    # Si MFA está activado, emitir token temporal y pedir segundo factor
    if user.mfa_enabled:
        temp_token = _issue_mfa_temp_token(user)
        return MFAChallengeResponse(temp_token=temp_token)

    _purge_old_revoked_sessions(db, user.id)
    token = _issue_tokens(db, user)
    register_device(db, user, request, token, method="Supabase")
    # Sin este commit la sesión de refresh nunca llegaba a la base: el usuario
    # recibía un refresh token cuyo `jti` no existía, y el primer intento de
    # renovar la sesión lo echaba fuera.
    db.commit()
    return token


def _send_reset_email(user_email: str, user_name: str, reset_url: str) -> None:
    """Entrega el correo de recuperación. Corre tras responder, y nunca falla la petición."""
    try:
        email_service.deliver_email(
            to_email=user_email,
            subject="Restablece tu contraseña de EDUCA",
            body_text=(
                f"Hola {user_name},\n\n"
                f"Hemos recibido una solicitud para restablecer la contraseña de tu cuenta en EDUCA.\n\n"
                f"Para continuar, haz clic en el siguiente enlace (válido por 30 minutos):\n{reset_url}\n\n"
                f"Si no solicitaste este cambio, puedes ignorar este mensaje de forma segura.\n"
            ),
            from_name="EDUCA",
        )
    except Exception as e:
        logger.warning("No se pudo enviar el correo de recuperación a %s: %s", user_email, e)


@router.post("/forgot-password", response_model=MessageResponse)
def forgot_password(
    payload: ForgotPasswordRequest,
    background: BackgroundTasks,
    request: Request = None,
    db: Session = Depends(get_db),
) -> MessageResponse:
    """Solicita un enlace de recuperación de contraseña.

    Por seguridad anti-enumeración, siempre responde con éxito con el mismo mensaje,
    exista o no la cuenta. Si existe y está activa, emite un token firmado
    y encola el correo. El envío (SMTP, cientos de ms) va tras la respuesta: hecho
    en línea, el tiempo de respuesta delataba qué correos tienen cuenta.
    """
    client_ip = _get_client_ip(request) if request else "unknown"
    ip_lockout = account_lockout.check_ip_lockout(client_ip)
    if ip_lockout.is_locked:
        retry_after = (
            int((ip_lockout.lockout_until - datetime.now(timezone.utc)).total_seconds())
            if ip_lockout.lockout_until
            else 900
        )
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "code": "ip_locked",
                "message": f"Demasiados intentos. Espera {retry_after // 60} minutos.",
            },
            headers={"Retry-After": str(retry_after)},
        )

    email_clean = normalize_email(payload.email)
    candidates = list(db.scalars(select(User).where(User.email == email_clean)).all())
    candidates = _narrow_to_tenant(db, candidates, payload.tenant_slug)

    standard_message = "Si el correo está registrado, recibirás instrucciones para restablecer tu contraseña en breve."

    # Sin bcrypt de relleno: aquí no se comprueba ninguna contraseña, así que la
    # rama de la cuenta existente es barata (firmar un JWT y encolar el correo).
    # Gastar bcrypt sólo cuando el correo *no* existe invertía el oráculo de
    # tiempo que se quería cerrar: la respuesta lenta delataba al ausente.
    if not candidates:
        return MessageResponse(message=standard_message)

    for user in candidates:
        if not user.is_active or tenant_suspended(db, user):
            continue

        reset_token = create_password_reset_token(
            subject=str(user.id),
            token_version=user.token_version,
            expire_minutes=30,
        )
        # El enlace apunta a la web, no a la API, y se arma con la dirección
        # configurada: la cabecera `Host` de la petición la escribe quien la
        # envía, y un enlace con *su* dominio y el token de la víctima es una
        # toma de cuenta.
        reset_url = f"{settings.frontend_base_url}/recuperar-clave?token={reset_token}"

        if email_service.email_configured():
            background.add_task(_send_reset_email, user.email, user.full_name, reset_url)
        else:
            # El token es una credencial: nunca va al log de producción. En
            # desarrollo, sin SMTP, es la única forma de recibir el enlace.
            logger.info("Recuperación solicitada para cuenta %s (SMTP no configurado).", user.id)
            if not settings.is_production:
                logger.info("Enlace de recuperación (sólo desarrollo): %s", reset_url)

    return MessageResponse(message=standard_message)


@router.post("/reset-password", response_model=Token | MFAChallengeResponse)
def reset_password(
    payload: ResetPasswordRequest,
    db: Session = Depends(get_db),
) -> Token | MFAChallengeResponse:
    """Restablece la contraseña utilizando un token válido emitido por /forgot-password."""
    token_data = decode_token(payload.token)
    if token_data is None or token_data.get("type") != "password_reset":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El enlace de recuperación es inválido o ha expirado. Solicita uno nuevo.",
        )

    sub = token_data.get("sub")
    if sub is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Token inválido")

    try:
        user_id = int(sub)
    except (TypeError, ValueError):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Token inválido")

    user = db.get(User, user_id)
    if user is None or not user.is_active or tenant_suspended(db, user):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Usuario no encontrado o inactivo")

    if token_data.get("tv") != user.token_version:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Este enlace ya fue utilizado o la contraseña ya fue modificada.",
        )

    # Verificar si la nueva contraseña ha sido comprometida
    breach_result = password_breach.check_password_breach_sync(payload.new_password)
    if breach_result.compromised:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "password_pwned",
                "message": (
                    f"Esta contraseña aparece en {breach_result.count} filtraciones de datos conocidas. "
                    "Por seguridad, elige una contraseña diferente."
                ),
                "breach_count": breach_result.count,
            },
        )

    user.password_hash = hash_password(payload.new_password)
    user.token_version += 1
    _revoke_all_refresh_sessions(db, user)

    record(
        db,
        user,
        "update",
        "user_password_reset",
        user.id,
        after={"token_version": user.token_version},
    )

    # Poseer el correo no puede valer como segundo factor: con MFA activo la
    # contraseña nueva queda puesta, pero la sesión se gana con el código.
    if user.mfa_enabled:
        db.commit()
        return MFAChallengeResponse(temp_token=_issue_mfa_temp_token(user))

    tokens = _issue_tokens(db, user)
    db.commit()
    return tokens
