from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import (
    apply_tenant,
    get_current_user,
    in_tenant,
    require_permission,
)
from app.models import Permission, Room, User, UserRole
from app.schemas.room import RoomCreate, RoomRead, RoomUpdate
from app.services.audit import record, snapshot

router = APIRouter(prefix="/rooms", tags=["rooms"])

admin_only = require_permission(Permission.manage_catalog)


@router.get("", response_model=list[RoomRead])
def list_rooms(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
) -> list[Room]:
    stmt = apply_tenant(select(Room), Room.tenant_id, current_user)
    return list(db.scalars(stmt).all())


@router.post("", response_model=RoomRead, status_code=status.HTTP_201_CREATED)
def create_room(
    payload: RoomCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(admin_only),
) -> Room:
    room = Room(**payload.model_dump(), tenant_id=current_user.tenant_id)
    db.add(room)
    db.flush()
    # A room is a physical resource classes get booked into; renaming or
    # deleting one moves or strands real classes, so it belongs in the trail.
    record(db, current_user, "create", "room", room.id, after=snapshot(room))
    db.commit()
    db.refresh(room)
    return room


@router.patch("/{room_id}", response_model=RoomRead)
def update_room(
    room_id: int,
    payload: RoomUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(admin_only),
) -> Room:
    room = db.get(Room, room_id)
    if not in_tenant(current_user, room):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Room not found")
    before = snapshot(room)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(room, field, value)
    record(db, current_user, "update", "room", room.id, before, snapshot(room))
    db.commit()
    db.refresh(room)
    return room


@router.delete("/{room_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_room(
    room_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(admin_only),
) -> None:
    room = db.get(Room, room_id)
    if not in_tenant(current_user, room):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Room not found")
    record(db, current_user, "delete", "room", room.id, before=snapshot(room))
    db.delete(room)
    db.commit()
