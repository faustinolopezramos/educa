from datetime import date, time

from pydantic import BaseModel, ConfigDict, model_validator


class ScheduleCreate(BaseModel):
    course_id: int
    teacher_id: int
    room_id: int | None = None
    day_of_week: int  # 0=Monday .. 6=Sunday
    start_time: time
    end_time: time

    @model_validator(mode="after")
    def _check_times(self) -> "ScheduleCreate":
        if self.start_time >= self.end_time:
            raise ValueError("start_time must be before end_time")
        if not 0 <= self.day_of_week <= 6:
            raise ValueError("day_of_week must be between 0 (Mon) and 6 (Sun)")
        return self


class ScheduleUpdate(BaseModel):
    course_id: int | None = None
    teacher_id: int | None = None
    room_id: int | None = None
    day_of_week: int | None = None
    start_time: time | None = None
    end_time: time | None = None

    @model_validator(mode="after")
    def _check(self) -> "ScheduleUpdate":
        if self.day_of_week is not None and not 0 <= self.day_of_week <= 6:
            raise ValueError("day_of_week must be between 0 (Mon) and 6 (Sun)")
        if (
            self.start_time is not None
            and self.end_time is not None
            and self.start_time >= self.end_time
        ):
            raise ValueError("start_time must be before end_time")
        return self


class ScheduleRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    course_id: int
    teacher_id: int
    room_id: int | None
    day_of_week: int
    start_time: time
    end_time: time
    term_start: date | None
    term_end: date | None


# ---- Conflict detection (live validation for the calendar) ----
class ConflictCheck(BaseModel):
    teacher_id: int
    room_id: int | None = None
    course_id: int | None = None
    day_of_week: int
    start_time: time
    end_time: time
    exclude_id: int | None = None


class ConflictInfo(BaseModel):
    """A human-readable description of a clashing schedule."""

    schedule_id: int
    course_id: int
    course_name: str
    day_of_week: int
    start_time: time
    end_time: time


class ConflictResponse(BaseModel):
    # Hard conflicts (teacher/room double-booking) — block the action.
    conflicts: list[ConflictInfo]
    room_conflicts: list[ConflictInfo] = []
    # Soft warnings (overridable with ?force=true).
    warnings: list[str] = []
