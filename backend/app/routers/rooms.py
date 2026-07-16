from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user, require_role
from app.models import Room, User, UserRole
from app.schemas.room import RoomCreate, RoomRead, RoomUpdate

router = APIRouter(prefix="/rooms", tags=["rooms"])

admin_only = require_role(UserRole.admin)


@router.get("", response_model=list[RoomRead])
def list_rooms(
    db: Session = Depends(get_db), _: User = Depends(get_current_user)
) -> list[Room]:
    return list(db.scalars(select(Room)).all())


@router.post("", response_model=RoomRead, status_code=status.HTTP_201_CREATED)
def create_room(
    payload: RoomCreate,
    db: Session = Depends(get_db),
    _: User = Depends(admin_only),
) -> Room:
    room = Room(**payload.model_dump())
    db.add(room)
    db.commit()
    db.refresh(room)
    return room


@router.patch("/{room_id}", response_model=RoomRead)
def update_room(
    room_id: int,
    payload: RoomUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(admin_only),
) -> Room:
    room = db.get(Room, room_id)
    if room is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Room not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(room, field, value)
    db.commit()
    db.refresh(room)
    return room


@router.delete("/{room_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_room(
    room_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(admin_only),
) -> None:
    room = db.get(Room, room_id)
    if room is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Room not found")
    db.delete(room)
    db.commit()
