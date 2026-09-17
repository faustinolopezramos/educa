from datetime import date
from typing import ClassVar

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import CourseStatus, TrackKind
from app.schemas.base import PatchModel


# ---- Nationality ----
class NationalityCreate(BaseModel):
    name: str


class NationalityUpdate(PatchModel):
    NON_NULLABLE: ClassVar[tuple[str, ...]] = ("name",)
    name: str | None = None


class NationalityRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str


# ---- Language ----
class LanguageCreate(BaseModel):
    name: str
    kind: TrackKind = TrackKind.language


class LanguageUpdate(PatchModel):
    NON_NULLABLE: ClassVar[tuple[str, ...]] = ("name", "kind")
    name: str | None = None
    kind: TrackKind | None = None


class LanguageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    kind: TrackKind


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
    periodicity: str | None = None
    max_students: int = Field(default=20, ge=1)
    passing_score: float = Field(default=6.0, ge=0, le=10)
    # A course is born a draft: it has no timetable and no teacher yet, so it
    # cannot honestly be offered to anybody. `POST /catalog/courses/{id}/status`
    # opens it once it does.
    status: CourseStatus = CourseStatus.draft


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
    periodicity: str | None = None
    max_students: int | None = Field(default=None, ge=1)
    passing_score: float | None = Field(default=None, ge=0, le=10)
    # Deliberately absent: status moves through `POST /courses/{id}/status`,
    # which checks what the move requires. Letting a generic PATCH set it would
    # route around every one of those checks.


class CourseRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    level_id: int
    name: str
    status: CourseStatus
    start_date: date | None
    end_date: date | None
    periodicity: str | None = None
    max_students: int
    passing_score: float
    # Filled by `attach_course_stats` on the list endpoint: how full the course
    # is, so the panel does not have to count enrolments client-side.
    seats_taken: int = 0
    teacher_count: int = 0
    schedule_count: int = 0


class CourseStatusChange(BaseModel):
    status: CourseStatus


class CourseStatusRefusal(BaseModel):
    """What the API answers when a move is legal but not yet earned."""

    reason: str
    message: str
    blockers: list[str]


# ---- Delete Impact ----
class DeleteImpact(BaseModel):
    """Cascade delete impact assessment for catalog entities."""
    can_delete: bool
    reason: str | None = None
    levels_count: int = 0
    courses_count: int = 0
    enrollments_count: int = 0
    attendance_count: int = 0
    grades_count: int = 0
    payments_count: int = 0
    invoices_count: int = 0
    message: str
