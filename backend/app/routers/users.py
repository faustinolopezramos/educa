from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func as sa_func
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import apply_tenant, in_tenant, require_role
from app.core.security import hash_password
from app.models import User, UserRole
from app.schemas.base import PaginatedResponse
from app.schemas.user import UserCreate, UserRead, UserUpdate
from app.services.audit import record, snapshot

router = APIRouter(prefix="/users", tags=["users"])

admin_only = require_role(UserRole.admin)


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
    current_user: User = Depends(admin_only),
) -> PaginatedResponse[UserRead]:
    filters = [User.role == role] if role is not None else []
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
    current_user: User = Depends(admin_only),
) -> User:
    _guard_role_assignment(current_user, payload.role)
    tenant_id = _resolve_tenant_id(current_user, payload.tenant_id)
    # Emails are unique *per tenant* (`uq_users_tenant_email`), so the
    # duplicate check has to be scoped the same way — a global check would
    # reject a legitimate address that only exists in another academy.
    if db.scalar(
        select(User).where(User.email == payload.email, User.tenant_id == tenant_id)
    ):
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")
    user = User(
        tenant_id=tenant_id,
        email=payload.email,
        full_name=payload.full_name,
        role=payload.role,
        timezone=payload.timezone,
        max_weekly_hours=payload.max_weekly_hours,
        phone=payload.phone,
        address=payload.address,
        nationality_id=payload.nationality_id,
        password_hash=hash_password(payload.password),
    )
    db.add(user)
    db.flush()
    # An account appearing is as much a change to explain later as one being
    # renamed or deleted, and those were both already traced — this was the one
    # gap in the trail, sitting exactly where accounts are born.
    record(db, current_user, "create", "user", user.id, after=snapshot(user))
    db.commit()
    db.refresh(user)
    return user


@router.get("/{user_id}", response_model=UserRead)
def get_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(admin_only),
) -> User:
    return _in_scope_or_404(db, current_user, user_id)


@router.patch("/{user_id}", response_model=UserRead)
def update_user(
    user_id: int,
    payload: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(admin_only),
) -> User:
    user = _in_scope_or_404(db, current_user, user_id)
    before = snapshot(user)
    data = payload.model_dump(exclude_unset=True)
    if "role" in data:
        # Changing your own role is never a legitimate admin action — it is how
        # an account grants itself powers nobody handed it.
        if user.id == current_user.id and data["role"] is not user.role:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                "No puedes cambiar tu propio rol; pide a otro administrador que lo haga.",
            )
        _guard_role_assignment(current_user, data["role"])
        # Demoting a superadmin is equally a superadmin-only act, otherwise an
        # admin could strip the only account that can manage tenants.
        _guard_role_assignment(current_user, user.role)
    if "password" in data:
        user.password_hash = hash_password(data.pop("password"))
        user.token_version += 1
    for field, value in data.items():
        setattr(user, field, value)
    # snapshot() redacts password_hash, so an audit row never leaks a secret.
    record(db, current_user, "update", "user", user.id, before, snapshot(user))
    db.commit()
    db.refresh(user)
    return user


from datetime import datetime, timezone
from app.models.refresh_session import RefreshSession


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(admin_only),
) -> None:
    user = _in_scope_or_404(db, current_user, user_id)
    if user.id == current_user.id:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "No puedes eliminar tu propia cuenta; pide a otro administrador que lo haga.",
        )
    # Revoke all active refresh tokens for the deleted user
    db.query(RefreshSession).filter(
        RefreshSession.user_id == user.id,
        RefreshSession.revoked_at.is_(None),
    ).update(
        {RefreshSession.revoked_at: datetime.now(timezone.utc)},
        synchronize_session=False,
    )

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
