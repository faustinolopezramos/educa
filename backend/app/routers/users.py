from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func as sa_func
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_role
from app.core.security import hash_password
from app.models import User, UserRole
from app.schemas.base import PaginatedResponse
from app.schemas.user import UserCreate, UserRead, UserUpdate
from app.services.audit import record, snapshot

router = APIRouter(prefix="/users", tags=["users"])

admin_only = require_role(UserRole.admin)


@router.get("", response_model=PaginatedResponse[UserRead])
def list_users(
    role: UserRole | None = None,
    offset: int = 0,
    limit: int = Query(default=200, le=500),
    db: Session = Depends(get_db),
    _: User = Depends(admin_only),
) -> PaginatedResponse[UserRead]:
    filters = [User.role == role] if role is not None else []
    total = db.scalar(select(sa_func.count(User.id)).where(*filters)) or 0
    rows = db.scalars(select(User).where(*filters).offset(offset).limit(limit)).all()
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
    _: User = Depends(admin_only),
) -> User:
    if db.scalar(select(User).where(User.email == payload.email)):
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")
    user = User(
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
    db.commit()
    db.refresh(user)
    return user


@router.get("/{user_id}", response_model=UserRead)
def get_user(
    user_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(admin_only),
) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    return user


@router.patch("/{user_id}", response_model=UserRead)
def update_user(
    user_id: int,
    payload: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(admin_only),
) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    before = snapshot(user)
    data = payload.model_dump(exclude_unset=True)
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


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(admin_only),
) -> None:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    if user.id == current_user.id:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "No puedes eliminar tu propia cuenta; pide a otro administrador que lo haga.",
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
