from pydantic import BaseModel, ConfigDict


class RoomCreate(BaseModel):
    name: str
    capacity: int | None = None
    is_virtual: bool = False


class RoomUpdate(BaseModel):
    name: str | None = None
    capacity: int | None = None
    is_virtual: bool | None = None


class RoomRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    capacity: int | None
    is_virtual: bool
