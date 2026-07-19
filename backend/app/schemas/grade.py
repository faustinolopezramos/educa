from typing import ClassVar

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.base import PatchModel

# The academy grades on a 0–10 scale, which the gradebook UI also advertises.
SCORE_MIN = 0.0
SCORE_MAX = 10.0


class GradeCreate(BaseModel):
    enrollment_id: int
    evaluation_name: str
    score: float = Field(ge=SCORE_MIN, le=SCORE_MAX)
    # None = course-level (exam/final); set = a grade for that class day.
    session_id: int | None = None


class GradeUpdate(PatchModel):
    NON_NULLABLE: ClassVar[tuple[str, ...]] = ("evaluation_name", "score")
    evaluation_name: str | None = None
    score: float | None = Field(default=None, ge=SCORE_MIN, le=SCORE_MAX)


class GradeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    enrollment_id: int
    session_id: int | None
    evaluation_name: str
    score: float
