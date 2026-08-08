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


# ---- Course ↔ teacher assignment ----
class CourseTeacherAssign(BaseModel):
    teacher_id: int
    is_lead: bool = False


class CourseTeacherRead(BaseModel):
    """A teacher assigned to a course, with the name for labelling a row."""

    model_config = ConfigDict(from_attributes=True)
    id: int
    course_id: int
    teacher_id: int
    is_lead: bool
    teacher_name: str


class TeacherReassignRequest(BaseModel):
    """Hand a teacher's courses — and the slots they teach — to another."""

    to_teacher_id: int
    #: Which courses to move. Omitted means every live course they hold.
    course_ids: list[int] | None = None
    #: Move despite a timetable clash on the destination teacher.
    force: bool = False


class TeacherReassignOutcome(BaseModel):
    course_id: int
    course_name: str
    ok: bool
    schedules_moved: int = 0
    reason: str | None = None


class TeacherReassignResult(BaseModel):
    moved: int
    failed: int
    outcomes: list[TeacherReassignOutcome]


class TeacherLiveAssignment(BaseModel):
    """A course still tied to the teacher, blocking their baja."""

    course_id: int
    course_name: str
    schedule_count: int


class TeacherLoadRead(BaseModel):
    """Weekly teaching load metrics for a teacher."""

    teacher_id: int
    assigned_hours: float
    availability_hours: float
    max_hours: float
    percentage: float
