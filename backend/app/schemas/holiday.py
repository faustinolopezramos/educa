from datetime import date

from pydantic import BaseModel, ConfigDict


class HolidayCreate(BaseModel):
    date: date
    name: str


class HolidayRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    date: date
    name: str
