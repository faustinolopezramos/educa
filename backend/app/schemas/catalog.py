from datetime import date
from typing import ClassVar

from pydantic import BaseModel, ConfigDict

from app.schemas.base import PatchModel


# ---- Language ----
class LanguageCreate(BaseModel):
    name: str


class LanguageUpdate(PatchModel):
    NON_NULLABLE: ClassVar[tuple[str, ...]] = ("name",)
    name: str | None = None


class LanguageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str


# ---- Level ----
class LevelCreate(BaseModel):
    language_id: int
    code: str
    name: str


class LevelUpdate(PatchModel):
    NON_NULLABLE: ClassVar[tuple[str, ...]] = ("language_id", "code", "name")
    language_id: int | None = None
    code: str | None = None
    name: str | None = None


class LevelRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    language_id: int
    code: str
    name: str


# ---- Course ----
class CourseCreate(BaseModel):
    level_id: int
    name: str
    start_date: date | None = None
    end_date: date | None = None
    max_students: int = 20
    passing_score: float = 6.0


class CourseUpdate(PatchModel):
    # start_date/end_date are genuinely nullable ("open term"), so null is a
    # meaningful value there and they stay off this list.
    NON_NULLABLE: ClassVar[tuple[str, ...]] = (
        "level_id",
        "name",
        "max_students",
        "passing_score",
    )
    level_id: int | None = None
    name: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    max_students: int | None = None
    passing_score: float | None = None


class CourseRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    level_id: int
    name: str
    start_date: date | None
    end_date: date | None
    max_students: int
    passing_score: float
