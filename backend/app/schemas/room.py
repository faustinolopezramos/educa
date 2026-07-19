from typing import ClassVar

from pydantic import BaseModel, ConfigDict

from app.schemas.base import PatchModel


class RoomCreate(BaseModel):
    name: str
    capacity: int | None = None
    is_virtual: bool = False


class RoomUpdate(PatchModel):
    # capacity is nullable ("unknown"); name and is_virtual are not.
    NON_NULLABLE: ClassVar[tuple[str, ...]] = ("name", "is_virtual")
    name: str | None = None
    capacity: int | None = None
    is_virtual: bool | None = None


class RoomRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    capacity: int | None
    is_virtual: bool
