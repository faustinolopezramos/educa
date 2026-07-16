from pydantic import BaseModel, ConfigDict, Field

# The academy grades on a 0–10 scale, which the gradebook UI also advertises.
SCORE_MIN = 0.0
SCORE_MAX = 10.0


class GradeCreate(BaseModel):
    enrollment_id: int
    evaluation_name: str
    score: float = Field(ge=SCORE_MIN, le=SCORE_MAX)


class GradeUpdate(BaseModel):
    evaluation_name: str | None = None
    score: float | None = Field(default=None, ge=SCORE_MIN, le=SCORE_MAX)


class GradeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    enrollment_id: int
    evaluation_name: str
    score: float
