from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func as sa_func
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import (
    apply_tenant,
    get_current_user,
    has_user_permission,
    in_tenant,
)
from app.core.http import commit_or_conflict
from app.core.security import hash_password
from app.models import Permission, User, UserRole
from app.models.refresh_session import RefreshSession
from app.services.staff import live_assignments
from app.schemas.base import PaginatedResponse
from app.schemas.kardex import StudentKardexResponse
from app.schemas.user import UserCreate, UserRead, UserUpdate
from app.services.audit import record, snapshot
from app.services.student_kardex import get_student_kardex

router = APIRouter(prefix="/users", tags=["users"])

# Una sola frase para las dos identidades únicas de una cuenta (correo y
# documento), porque quien la lee sólo necesita saber que ya existe alguien así
# — y decir *cuál* de las dos chocó confirmaría a un tercero que ese correo o
# ese DPI están registrados en esta academia.
_DUPLICATE_IDENTITY = (
    "Ya existe un usuario con este correo electrónico o esta identificación "
    "personal (CUI / DPI o Pasaporte) en la academia"
)


# Which roles each permission puts an assistant in charge of. The user
# directory is the one place where "what may I do?" is a question about *whose*
# record it is, not just which endpoint was called.
_MANAGEABLE_ROLES: dict[Permission, UserRole] = {
    Permission.manage_teachers: UserRole.teacher,
    Permission.manage_students: UserRole.student,
}


def _manageable_roles(actor: User) -> set[UserRole]:
    """The roles `actor` may create, edit or delete.

    An admin manages everyone in their academy. An assistant manages only the
    populations they were handed, and never another staff account: handing out
    `manage_teachers` is not meant to hand out the ability to edit an admin.
    """
    if actor.role in (UserRole.admin, UserRole.superadmin):
        return set(UserRole)
    if actor.role != UserRole.assistant:
        return set()
    held = set(actor.permissions or [])
    return {role for perm, role in _MANAGEABLE_ROLES.items() if perm.value in held}


def _get_staff_actor(current_user: User = Depends(get_current_user)) -> User:
    """Anyone who may see the user directory at all.

    This used to admit an assistant holding *any* permission whatsoever, so one
    granted only `manage_finance` could read every account in the academy —
    names, emails and roles included. The directory now answers only to the two
    permissions that are actually about people.
    """
    if _manageable_roles(current_user):
        return current_user
    raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient permissions")


def _revoke_sessions(db: Session, user: User) -> None:
    """End every open session of `user`, server-side."""
    db.query(RefreshSession).filter(
        RefreshSession.user_id == user.id,
        RefreshSession.revoked_at.is_(None),
    ).update(
        {RefreshSession.revoked_at: datetime.now(timezone.utc)},
        synchronize_session=False,
    )


def _guard_deactivation(db: Session, user: User, actor: User) -> None:
    """Refuse a baja that would strand a live class, and say what to move.

    A deactivated teacher cannot log in, so leaving them on an open course would
    leave that course with nobody able to take its register. The refusal carries
    the courses to reassign, which is what `POST /teachers/{id}/reassign` takes
    — the error is the entry point to the fix, not a dead end.
    """
    if user.id == actor.id:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "No puedes desactivar tu propia cuenta; pide a otro administrador que lo haga.",
        )
    if user.role != UserRole.teacher:
        return
    pending = live_assignments(db, user.id)
    if pending:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": (
                    "Este profesor todavía imparte cursos activos. Reasígnalos a "
                    "otro profesor antes de darle de baja."
                ),
                "reason": "has_live_assignments",
                "courses": [
                    {
                        "course_id": a.course_id,
                        "course_name": a.course_name,
                        "schedule_count": len(a.schedule_ids),
                    }
                    for a in pending
                ],
            },
        )


def _assert_may_manage(actor: User, target_role: UserRole) -> None:
    """Guard a write against the roles the actor was actually handed."""
    if target_role not in _manageable_roles(actor):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            f"No tienes permiso para gestionar usuarios con rol '{target_role.value}'",
        )


def _guard_role_assignment(actor: User, role: UserRole | None) -> None:
    """Only a superadmin may grant — or revoke — the superadmin role.

    Without this an admin could `PATCH /users/{id}` themselves to `superadmin`
    and walk into the tenant endpoints, the one thing their own role is meant
    to keep them out of; or demote the only account that can manage tenants.
    """
    if role is UserRole.superadmin and actor.role is not UserRole.superadmin:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Solo un superadministrador puede asignar o retirar el rol de superadministrador",
        )


def _in_scope_or_404(db: Session, actor: User, user_id: int) -> User:
    """A user inside the caller's academy, or 404.

    404 rather than 403 on purpose: answering "forbidden" would confirm that an
    account with that id exists in *some* academy, which is itself a fact one
    academy should not learn about another.
    """
    user = db.get(User, user_id)
    if not in_tenant(actor, user):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    return user


def _resolve_tenant_id(actor: User, requested: int | None) -> int | None:
    """Which tenant a newly created user belongs to.

    An admin can only ever create users inside their own academy, so a
    `tenant_id` they send is ignored rather than trusted. A superadmin operates
    across academies and may place the user anywhere.
    """
    if actor.role is UserRole.superadmin:
        return requested
    return actor.tenant_id


@router.get("", response_model=PaginatedResponse[UserRead])
def list_users(
    role: UserRole | None = None,
    offset: int = 0,
    limit: int = Query(default=200, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(_get_staff_actor),
) -> PaginatedResponse[UserRead]:
    filters = [User.role == role] if role is not None else []
    # An assistant sees the populations they manage and no others. Without this
    # the directory handed a student-desk assistant the full staff list.
    if current_user.role == UserRole.assistant:
        # Non-empty by construction: `_get_staff_actor` turned away any
        # assistant holding neither people permission.
        filters.append(User.role.in_(_manageable_roles(current_user)))
    count_stmt = apply_tenant(
        select(sa_func.count(User.id)).where(*filters), User.tenant_id, current_user
    )
    list_stmt = apply_tenant(select(User).where(*filters), User.tenant_id, current_user)
    total = db.scalar(count_stmt) or 0
    rows = db.scalars(list_stmt.offset(offset).limit(limit)).all()
    return PaginatedResponse(
        items=[UserRead.model_validate(u) for u in rows],
        total=total,
        offset=offset,
        limit=limit,
    )


@router.post("", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(_get_staff_actor),
) -> User:
    _guard_role_assignment(current_user, payload.role)
    _assert_may_manage(current_user, payload.role)
    tenant_id = _resolve_tenant_id(current_user, payload.tenant_id)
    # `CuiPassport` ya rechazó lo que no tenga forma de documento y devolvió la
    # forma canónica, así que aquí no queda formato que comprobar — sólo si esa
    # identidad ya está registrada.
    cui = payload.cui_passport

    # Check for duplicate email per tenant
    if db.scalar(
        select(User).where(User.email == payload.email, User.tenant_id == tenant_id)
    ):
        raise HTTPException(status.HTTP_409_CONFLICT, "Ya existe un usuario con este correo electrónico")

    if db.scalar(
        select(User).where(User.cui_passport == cui, User.tenant_id == tenant_id)
    ):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Ya existe un usuario registrado con esta identificación personal (CUI / DPI o Pasaporte)",
        )

    user = User(
        tenant_id=tenant_id,
        email=payload.email,
        full_name=payload.full_name,
        cui_passport=cui,
        role=payload.role,
        timezone=payload.timezone,
        max_weekly_hours=payload.max_weekly_hours,
        phone=payload.phone,
        address=payload.address,
        nationality_id=payload.nationality_id,
        permissions=[p.value for p in payload.permissions or []],
        password_hash=hash_password(payload.password),
    )
    db.add(user)
    db.flush()
    # An account appearing is as much a change to explain later as one being
    # renamed or deleted, and those were both already traced — this was the one
    # gap in the trail, sitting exactly where accounts are born.
    record(db, current_user, "create", "user", user.id, after=snapshot(user))
    # Las dos comprobaciones de arriba y este commit no son atómicos, así que
    # dos altas simultáneas del mismo correo o del mismo documento todavía
    # pueden cruzarse. Quien pierde la carrera pidió algo que el modelo prohíbe,
    # que es un conflicto y no un error del servidor.
    commit_or_conflict(db, _DUPLICATE_IDENTITY)
    db.refresh(user)
    return user


@router.get("/{user_id}", response_model=UserRead)
def get_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(_get_staff_actor),
) -> User:
    user = _in_scope_or_404(db, current_user, user_id)
    _assert_may_manage(current_user, user.role)
    return user


@router.patch("/{user_id}", response_model=UserRead)
def update_user(
    user_id: int,
    payload: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(_get_staff_actor),
) -> User:
    user = _in_scope_or_404(db, current_user, user_id)
    # Both ends of the edit are guarded: the account being touched, and the role
    # it is being moved to. Checking only the first would let an assistant
    # promote a student they manage into an admin they do not.
    _assert_may_manage(current_user, user.role)
    before = snapshot(user)
    data = payload.model_dump(exclude_unset=True)

    if "email" in data and data["email"] != user.email:
        # `create_user` comprobaba el correo duplicado y esto no, así que mover
        # una cuenta a un correo ya usado rompía contra `uq_users_tenant_email`
        # y salía como 500. Se comprueba aquí y no sólo con el índice porque en
        # Postgres `NULL != NULL`: la constraint es sobre (tenant_id, email) y
        # no restringe a las cuentas sin academia — el superadministrador.
        if db.scalar(
            select(User).where(
                User.email == data["email"],
                User.tenant_id == user.tenant_id,
                User.id != user.id,
            )
        ):
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "Ya existe un usuario con este correo electrónico",
            )

    if "cui_passport" in data and data["cui_passport"]:
        # Ya viene canónico del esquema; comparar la forma cruda dejaba pasar
        # el mismo documento escrito con otra puntuación o en minúsculas.
        cui = data["cui_passport"]
        dup = db.scalar(
            select(User).where(
                User.cui_passport == cui,
                User.tenant_id == user.tenant_id,
                User.id != user.id,
            )
        )
        if dup:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "Ya existe un usuario registrado con esta identificación personal (CUI / DPI o Pasaporte)",
            )
    if "role" in data:
        # Changing your own role is never a legitimate admin action — it is how
        # an account grants itself powers nobody handed it.
        if user.id == current_user.id and data["role"] is not user.role:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                "No puedes cambiar tu propio rol; pide a otro administrador que lo haga.",
            )
        _guard_role_assignment(current_user, data["role"])
        _assert_may_manage(current_user, data["role"])
        # Demoting a superadmin is equally a superadmin-only act, otherwise an
        # admin could strip the only account that can manage tenants.
        _guard_role_assignment(current_user, user.role)
    if "password" in data:
        user.password_hash = hash_password(data.pop("password"))
        user.token_version += 1
    if "permissions" in data:
        # The column is plain JSON; the schema hands over Permission members.
        data["permissions"] = [p.value for p in data["permissions"] or []]
    if data.get("is_active") is False:
        _guard_deactivation(db, user, current_user)
    if "is_active" in data and data["is_active"] != user.is_active:
        # Switching an account off has to end the sessions it already has, not
        # just refuse the next login.
        _revoke_sessions(db, user)
        user.token_version += 1
    for field, value in data.items():
        setattr(user, field, value)
    # snapshot() redacts password_hash, so an audit row never leaks a secret.
    record(db, current_user, "update", "user", user.id, before, snapshot(user))
    # El correo no se comprobaba aquí en absoluto (sólo al crear), así que
    # moverlo a uno ya usado en la academia rompía contra `uq_users_tenant_email`
    # y salía como 500. Es un conflicto, y ahora lo dice.
    commit_or_conflict(db, _DUPLICATE_IDENTITY)
    db.refresh(user)
    return user



@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(_get_staff_actor),
) -> None:
    user = _in_scope_or_404(db, current_user, user_id)
    _assert_may_manage(current_user, user.role)
    if user.id == current_user.id:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "No puedes eliminar tu propia cuenta; pide a otro administrador que lo haga.",
        )
    # Revoke all active refresh tokens for the deleted user
    _revoke_sessions(db, user)

    record(db, current_user, "delete", "user", user.id, before=snapshot(user))
    db.delete(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="El profesor aún tiene horarios asignados; reasígnalos antes de eliminarlo.",
        )


@router.get("/{student_id}/kardex", response_model=StudentKardexResponse)
def get_student_kardex_endpoint(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> StudentKardexResponse:
    """El expediente académico 360° (Kardex) de un alumno.

    Un alumno abre el suyo, y de nadie más. Del otro lado sólo entra quien ya
    administra alumnos — la misma llave que abre `GET /users/{id}`, porque este
    expediente reúne el historial completo, los certificados y el **saldo
    pendiente**. Dejarlo detrás de la mera autenticación lo ponía al alcance de
    cualquier profesor, sobre alumnos que nunca tuvo en clase, y de un asistente
    sin ningún permiso concedido.
    """
    user = _in_scope_or_404(db, current_user, student_id)
    # Quien no es alumno no tiene expediente. 404 antes que devolver un kardex
    # vacío, que se lee como "este alumno no tiene historial" y no como "aquí no
    # había un alumno".
    if user.role != UserRole.student:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    if current_user.id != user.id and not has_user_permission(
        current_user, Permission.manage_students
    ):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "No tienes permiso para ver este expediente",
        )
    return get_student_kardex(db, user.id)

