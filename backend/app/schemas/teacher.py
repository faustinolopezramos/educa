from datetime import time

from pydantic import BaseModel, ConfigDict, model_validator


# ---- Teacher ↔ language qualification ----
class TeacherLanguageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    teacher_id: int
    language_id: int


class TeacherLanguagesSet(BaseModel):
    """Replace the full set of languages a teacher is qualified for."""

    language_ids: list[int]


# ---- Teacher availability windows ----
class AvailabilityCreate(BaseModel):
    day_of_week: int
    start_time: time
    end_time: time

    @model_validator(mode="after")
    def _check(self) -> "AvailabilityCreate":
        if self.start_time >= self.end_time:
            raise ValueError("start_time must be before end_time")
        if not 0 <= self.day_of_week <= 6:
            raise ValueError("day_of_week must be between 0 (Mon) and 6 (Sun)")
        return self


class AvailabilityRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    teacher_id: int
    day_of_week: int
    start_time: time
    end_time: time


# ---- Assistant: available teachers for a slot ----
class AvailableTeacher(BaseModel):
    id: int
    full_name: str
