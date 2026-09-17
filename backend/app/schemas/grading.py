from typing import ClassVar

from pydantic import BaseModel, ConfigDict

from app.models.enums import SkillCategory
from app.schemas.base import PatchModel


# ---- Course evaluation weights ----
class CourseEvaluationCreate(BaseModel):
    name: str
    weight: float = 1.0
    skill: SkillCategory | None = None


class CourseEvaluationUpdate(PatchModel):
    NON_NULLABLE: ClassVar[tuple[str, ...]] = ("name", "weight")
    name: str | None = None
    weight: float | None = None
    skill: SkillCategory | None = None


class CourseEvaluationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    course_id: int
    name: str
    weight: float
    skill: SkillCategory | None = None


# ---- Final grade ----
class ComponentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    name: str
    score: float
    weight: float
    skill: SkillCategory | None = None



class FinalGradeRead(BaseModel):
    enrollment_id: int
    final_score: float | None
    passing_score: float
    passed: bool
    components: list[ComponentRead]
