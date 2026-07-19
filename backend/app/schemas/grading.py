from datetime import datetime
from typing import ClassVar

from pydantic import BaseModel, ConfigDict

from app.schemas.base import PatchModel


# ---- Course evaluation weights ----
class CourseEvaluationCreate(BaseModel):
    name: str
    weight: float = 1.0


class CourseEvaluationUpdate(PatchModel):
    NON_NULLABLE: ClassVar[tuple[str, ...]] = ("name", "weight")
    name: str | None = None
    weight: float | None = None


class CourseEvaluationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    course_id: int
    name: str
    weight: float


# ---- Final grade ----
class ComponentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    name: str
    score: float
    weight: float


class FinalGradeRead(BaseModel):
    enrollment_id: int
    final_score: float | None
    passing_score: float
    passed: bool
    components: list[ComponentRead]


# ---- Certificate ----
class CertificateRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    enrollment_id: int
    level_id: int
    final_score: float
    code: str
    issued_at: datetime
