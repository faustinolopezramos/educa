"""Seguridad de la cuenta: segundo factor (MFA), sesiones de dispositivo y passkeys.

Salió de `auth.py`, que mezclaba el acceso (login, registro, recuperación) con la
gestión de la seguridad una vez dentro. Comparte prefijo `/auth` y los ayudantes
de emisión de sesión con él.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user, tenant_suspended
from app.core.http import client_ip
from app.core.security import decode_token, verify_password
from app.models import User
from app.routers.auth import (
    _issue_tokens,
    _mfa_locked_exc,
    _purge_old_revoked_sessions,
    _raise_if_user_locked,
    register_device,
)
from app.schemas.auth import (
    DeviceSessionListResponse,
    DeviceSessionRead,
    MFADisableRequest,
    MFAEnableRequest,
    MFARegenerateBackupCodesResponse,
    MFASetupResponse,
    MFAVerifyRequest,
    ReauthRequest,
    RevokeAllOtherSessionsResponse,
    RevokeSessionRequest,
    Token,
    WebAuthnAuthenticateFinishRequest,
    WebAuthnAuthenticateFinishResponse,
    WebAuthnAuthenticateStartResponse,
    WebAuthnCredentialListResponse,
    WebAuthnRegisterFinishRequest,
    WebAuthnRegisterStartResponse,
)
from app.services import account_lockout, device_sessions, mfa, webauthn

router = APIRouter(prefix="/auth", tags=["auth"])


def _require_reauth(
    db: Session,
    user: User,
    request: Request | None,
    password: str | None,
    mfa_token: str | None,
) -> None:
    """Exige contraseña (y código MFA si lo tiene) antes de tocar la seguridad.

    Se usa donde una sesión robada ganaría algo que sobrevive a ella: registrar
    una passkey (entra sin contraseña ni MFA, y no la cierra un cambio de
    contraseña) o cambiar el segundo factor. Los fallos cuentan para el mismo
    bloqueo que el login, así que no es una puerta para adivinar la contraseña.

    Usa 400 y no 401: un 401 hace que el cliente intente renovar la sesión y, si
    falla, la cierre, y aquí la sesión es buena; lo que falló es la confirmación.
    """
    _raise_if_user_locked(user.id)
    if not verify_password(password or "", user.password_hash):
        account_lockout.record_failed_login(
            client_ip(request) if request else "unknown", user.id
        )
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Contraseña incorrecta.")

    if not user.mfa_enabled:
        return

    if not (mfa_token or "").strip():
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            {
                "code": "mfa_token_required",
                "message": "Introduce también el código de tu app autenticadora.",
            },
        )
    if account_lockout.check_mfa_lockout(user.id).is_locked:
        raise _mfa_locked_exc(user.id)
    result = mfa.verify_mfa_token(
        user.mfa_secret,
        user.mfa_backup_codes,
        mfa_token or "",
        last_used=user.mfa_last_used,
    )
    if not result.success:
        account_lockout.record_failed_mfa(user.id)
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Código MFA inválido.")
    account_lockout.clear_mfa_lockout(user.id)
    _spend_mfa_credential(user, result)


def _spend_mfa_credential(user: User, result: mfa.MFAVerificationResult) -> None:
    """Gasta lo que acaba de valer: un código de respaldo sólo sirve una vez y un
    TOTP no se reutiliza. También cifra el secreto si estaba guardado en claro."""
    if result.backup_code_used and result.used_backup_index is not None:
        user.mfa_backup_codes = [
            c
            for i, c in enumerate(user.mfa_backup_codes or [])
            if i != result.used_backup_index
        ]
    if result.totp_window is not None:
        user.mfa_last_used = result.totp_window
    if mfa.needs_sealing(user.mfa_secret):
        user.mfa_secret = mfa.seal_secret(user.mfa_secret)


# ---------- MFA / 2FA endpoints ----------


@router.post("/mfa/setup", response_model=MFASetupResponse)
def mfa_setup(
    payload: ReauthRequest,
    request: Request = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MFASetupResponse:
    """Inicia la configuración de MFA: genera secreto, QR y códigos de respaldo.

    Guarda el secreto temporalmente en el usuario (sin activar MFA aún).
    Solo se activa tras verificar el primer token en POST /mfa/enable.

    Pide la contraseña: con una sesión robada, quien lo activara con su propio
    autenticador dejaría fuera al dueño. Es POST porque cambia el estado.
    """
    if current_user.mfa_enabled:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "MFA ya está activado. Desactívalo primero si quieres reconfigurarlo.",
        )
    _require_reauth(db, current_user, request, payload.password, payload.mfa_token)
    setup = mfa.create_mfa_setup(current_user.email)
    # Guardar secreto temporalmente (no activado hasta verify)
    current_user.mfa_secret = mfa.seal_secret(setup.secret)
    # Los códigos que se muestran ahora son los que valdrán: se guardan (con
    # hash) en este paso. Antes `/mfa/enable` los descartaba y generaba otros
    # que nadie veía, así que los que el usuario apuntó no servían.
    current_user.mfa_backup_codes = mfa.hash_backup_codes(setup.backup_codes)
    db.commit()
    return MFASetupResponse(
        secret=setup.secret,
        qr_code_svg=setup.qr_code_svg,
        backup_codes=setup.backup_codes,
        otpauth_url=setup.otpauth_url,
    )


@router.post("/mfa/enable")
def mfa_enable(
    payload: MFAEnableRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    """Activa MFA tras verificar el primer token TOTP.

    Requiere el token de 6 dígitos que muestra la app autenticadora.
    Guarda el secreto y los códigos de respaldo (hasheados).
    """
    if current_user.mfa_enabled:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "MFA ya está activado.",
        )

    if not current_user.mfa_secret:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "No hay configuración MFA pendiente. Inicia setup de nuevo.",
        )

    if account_lockout.check_mfa_lockout(current_user.id).is_locked:
        raise _mfa_locked_exc(current_user.id)
    secret = mfa.open_secret(current_user.mfa_secret)
    window = mfa.match_totp(secret, payload.token) if secret else None
    if window is None:
        account_lockout.record_failed_mfa(current_user.id)
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Código inválido. Verifica la hora en tu dispositivo y vuelve a intentarlo.",
        )

    account_lockout.clear_mfa_lockout(current_user.id)
    # Los códigos de respaldo ya quedaron guardados en `/mfa/setup`.
    current_user.mfa_enabled = True
    current_user.mfa_last_used = window
    db.commit()

    return {"message": "MFA activado correctamente. Guarda tus códigos de respaldo en un lugar seguro."}


@router.post("/mfa/disable")
def mfa_disable(
    payload: MFADisableRequest,
    request: Request = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    """Desactiva MFA tras verificar contraseña y token actual."""
    if not current_user.mfa_enabled:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "MFA no está activado.",
        )

    # Contraseña *y* código: con sólo la contraseña, quien la hubiera robado
    # apagaría el segundo factor que existe para cubrir ese caso.
    _require_reauth(db, current_user, request, payload.password, payload.token)

    # Desactivar
    current_user.mfa_enabled = False
    current_user.mfa_secret = None
    current_user.mfa_backup_codes = []
    current_user.mfa_last_used = None
    db.commit()

    return {"message": "MFA desactivado correctamente."}


@router.post("/mfa/regenerate-backup-codes", response_model=MFARegenerateBackupCodesResponse)
def mfa_regenerate_backup_codes(
    payload: ReauthRequest,
    request: Request = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MFARegenerateBackupCodesResponse:
    """Genera nuevos códigos de respaldo (invalida los anteriores).

    Pide contraseña y código: unos códigos de respaldo nuevos son una forma de
    entrar sin el autenticador, y los anteriores dejan de valer.
    """
    if not current_user.mfa_enabled:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "MFA no está activado.",
        )
    _require_reauth(db, current_user, request, payload.password, payload.mfa_token)

    new_codes = mfa.generate_backup_codes()
    current_user.mfa_backup_codes = mfa.hash_backup_codes(new_codes)
    db.commit()

    return MFARegenerateBackupCodesResponse(backup_codes=new_codes)


@router.post("/mfa/verify", response_model=Token)
def mfa_verify(
    payload: MFAVerifyRequest,
    authorization: str | None = Header(None),
    request: Request = None,
    db: Session = Depends(get_db),
) -> Token:
    """Verifica token MFA y emite tokens completos de acceso.

    Recibe el token temporal (del login/supabase-login) en header Authorization
    y el código MFA en el body. Devuelve access + refresh tokens.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Falta token temporal de MFA",
            headers={"WWW-Authenticate": "Bearer"},
        )

    temp_token = authorization[7:]
    token_data = decode_token(temp_token)
    if not token_data or token_data.get("type") != "mfa":
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Token temporal inválido o expirado",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        user_id = int(token_data.get("sub"))
    except (TypeError, ValueError):
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Token temporal inválido",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = db.get(User, user_id)
    if (
        not user
        or not user.is_active
        or not user.mfa_enabled
        # Contraseña cambiada o sesiones cerradas desde que se emitió el desafío.
        or token_data.get("ver") != user.token_version
        or tenant_suspended(db, user)
    ):
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Usuario no válido para MFA",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Un código de 6 dígitos se adivina por fuerza bruta: sin este tope, repetir
    # el login (que acierta la contraseña y por tanto no gasta presupuesto)
    # daba intentos ilimitados.
    if account_lockout.check_mfa_lockout(user.id).is_locked:
        raise _mfa_locked_exc(user.id)

    # Verificar token MFA (TOTP o backup code)
    result = mfa.verify_mfa_token(
        user.mfa_secret,
        user.mfa_backup_codes,
        payload.token,
        last_used=user.mfa_last_used,
    )
    if not result.success:
        account_lockout.record_failed_mfa(user.id)
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Código MFA inválido",
            headers={"WWW-Authenticate": "Bearer"},
        )
    account_lockout.clear_mfa_lockout(user.id)

    # Un código de respaldo vale una sola vez; con un TOTP se guarda *su*
    # ventana, no la hora actual, así que ni ese código ni uno anterior vuelven
    # a valer pero el de la ventana siguiente sí.
    _spend_mfa_credential(user, result)
    if result.totp_window is None:
        user.mfa_last_used = datetime.now(timezone.utc)

    _purge_old_revoked_sessions(db, user.id)
    token = _issue_tokens(db, user)
    register_device(db, user, request, token)
    db.commit()
    return token


# ---------- Device Session endpoints ----------


@router.get("/device-sessions", response_model=DeviceSessionListResponse)
def list_device_sessions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    authorization: str | None = Header(None),
) -> DeviceSessionListResponse:
    """Lista las sesiones de dispositivo activas, marcando la actual.

    «Actual» es la que lleva el `sid` del access token con el que se pregunta.
    """
    token_data = decode_token(authorization[7:]) if authorization and authorization.startswith("Bearer ") else None
    sid = token_data.get("sid") if token_data else None
    items = []
    for row in device_sessions.get_user_device_sessions(db, current_user.id):
        item = DeviceSessionRead.model_validate(row)
        item.is_current = bool(sid) and row.refresh_jti == sid
        items.append(item)
    return DeviceSessionListResponse(sessions=items)


@router.post("/device-sessions/revoke", status_code=status.HTTP_204_NO_CONTENT)
def revoke_device_session_endpoint(
    payload: RevokeSessionRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    """Revoca una sesión de dispositivo específica."""
    success = device_sessions.revoke_device_session(db, payload.session_id, current_user.id)
    if not success:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            "Sesión no encontrada o ya revocada",
        )
    db.commit()


@router.post("/device-sessions/revoke-all-other", response_model=RevokeAllOtherSessionsResponse)
def revoke_all_other_device_sessions_endpoint(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    authorization: str = Header(...),
) -> RevokeAllOtherSessionsResponse:
    """Cierra todas las sesiones salvo la actual.

    La actual se identifica por el `sid` del access token con el que se llama.
    Antes este endpoint cerraba *todas*, la actual incluida, y decía que sólo
    había cerrado «adicionales».
    """
    token_data = decode_token(authorization[7:]) if authorization.startswith("Bearer ") else None
    sid = token_data.get("sid") if token_data else None
    if not sid:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "No se pudo identificar esta sesión. Cierra sesión y vuelve a entrar.",
        )
    revoked = device_sessions.revoke_all_other_device_sessions(db, current_user.id, keep_jti=sid)
    db.commit()
    return RevokeAllOtherSessionsResponse(
        revoked_count=revoked,
        message=f"Se cerraron {revoked} sesiones adicionales",
    )


@router.post("/device-sessions/revoke-all", status_code=status.HTTP_204_NO_CONTENT)
def revoke_all_device_sessions_endpoint(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    """Revoca TODAS las sesiones del usuario (incluye la actual).

    El usuario deberá volver a iniciar sesión.
    """
    device_sessions.revoke_all_device_sessions(db, current_user.id)
    db.commit()


# ---------- WebAuthn / Passkey endpoints ----------


@router.post("/webauthn/register/start", response_model=WebAuthnRegisterStartResponse)
def webauthn_register_start(
    payload: ReauthRequest,
    request: Request = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> WebAuthnRegisterStartResponse:
    """Inicia el registro de una nueva passkey.

    Pide contraseña (y código MFA si lo tiene): una passkey entra sin contraseña
    ni segundo factor y sobrevive a un cambio de contraseña, así que registrarla
    con sólo una sesión robada dejaba una puerta trasera permanente.
    """
    try:
        _require_reauth(db, current_user, request, payload.password, payload.mfa_token)
        options = webauthn.generate_registration_options_webauthn(current_user, db)
        response = WebAuthnRegisterStartResponse(options=webauthn.options_to_json_safe(options))
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))
    # El desafío quedó guardado: sin commit no existiría al terminar el registro.
    db.commit()
    return response


@router.post("/webauthn/register/finish")
def webauthn_register_finish(
    payload: WebAuthnRegisterFinishRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    """Completa el registro de una passkey."""
    try:
        cred = webauthn.verify_registration_response_webauthn(
            db, current_user, payload.credential, payload.challenge
        )
    except ValueError as e:
        db.commit()  # el desafío se gasta aunque la respuesta falle
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))
    db.commit()
    return {"message": "Passkey registrada correctamente", "credential_id": str(cred.id)}


@router.post("/webauthn/authenticate/start", response_model=WebAuthnAuthenticateStartResponse)
def webauthn_authenticate_start(
    db: Session = Depends(get_db),
) -> WebAuthnAuthenticateStartResponse:
    """Inicia el acceso con passkey.

    Es público a propósito: es el paso *previo* a tener sesión. Pedía estar
    autenticado, lo que hacía imposible usarlo para entrar. Sin cuenta
    identificada, el navegador ofrece las passkeys que tenga para este sitio.
    """
    try:
        webauthn.cleanup_expired_challenges(db)  # este paso es público: que no acumule filas
        options = webauthn.generate_authentication_options_webauthn(db, None)
        response = WebAuthnAuthenticateStartResponse(options=webauthn.options_to_json_safe(options))
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))
    db.commit()
    return response


@router.post("/webauthn/authenticate/finish", response_model=WebAuthnAuthenticateFinishResponse)
def webauthn_authenticate_finish(
    payload: WebAuthnAuthenticateFinishRequest,
    request: Request = None,
    db: Session = Depends(get_db),
) -> WebAuthnAuthenticateFinishResponse:
    """Completa el acceso con passkey (sin contraseña).

    Una passkey con verificación de usuario (huella, rostro, PIN) ya reúne dos
    factores —algo que se tiene y algo que se es o se sabe—, por eso no se pide
    además el código MFA. Sí rigen las mismas condiciones de cuenta que en el
    login: activa y con la academia en servicio.
    """
    try:
        cred = webauthn.verify_authentication_response_webauthn(
            db, payload.credential, payload.challenge
        )
    except ValueError as e:
        db.commit()  # el desafío se gasta aunque la respuesta falle
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, str(e))

    user = db.get(User, cred.user_id)
    if not user or not user.is_active or tenant_suspended(db, user):
        db.commit()
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Usuario no válido")

    _purge_old_revoked_sessions(db, user.id)
    token = _issue_tokens(db, user)
    register_device(db, user, request, token, method="Passkey")
    db.commit()
    return WebAuthnAuthenticateFinishResponse(token=token)


@router.get("/webauthn/credentials", response_model=WebAuthnCredentialListResponse)
def webauthn_list_credentials(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> WebAuthnCredentialListResponse:
    """Lista todas las passkeys registradas del usuario."""
    creds = webauthn.get_user_credentials(db, current_user.id)
    return WebAuthnCredentialListResponse(credentials=creds)


@router.delete("/webauthn/credentials/{credential_id}", status_code=status.HTTP_204_NO_CONTENT)
def webauthn_delete_credential(
    credential_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    """Elimina una passkey registrada."""
    success = webauthn.delete_credential(db, credential_id, current_user.id)
    if not success:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Credencial no encontrada")
    db.commit()
