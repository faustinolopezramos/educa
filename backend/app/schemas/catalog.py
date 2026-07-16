from datetime import date

from pydantic import BaseModel, ConfigDict


# ---- Language ----
class LanguageCreate(BaseModel):
    name: str


class LanguageUpdate(BaseModel):
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


class LevelUpdate(BaseModel):
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


class CourseUpdate(BaseModel):
    level_id: int | None = None
    name: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    max_students: int | None = None


class CourseRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    level_id: int
    name: str
    start_date: date | None
    end_date: date | None
    max_students: int
