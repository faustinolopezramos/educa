from datetime import date, datetime, time

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import Modality, ProposalStatus
from app.schemas.base import Money


class RenewalSlot(BaseModel):
    day_of_week: int
    start_time: time
    end_time: time
    modality: Modality


class RenewalCourseOption(BaseModel):
    """One open group of the next level, as the student chooses between them."""

    id: int
    name: str
    start_date: date | None
    end_date: date | None
    seats_left: int
    schedules: list[RenewalSlot]
    #: Clashes with a class the student already holds a seat in.
    clashes: bool


class RenewalRequestRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    student_id: int
    student_name: str = ""
    from_enrollment_id: int
    from_course_name: str = ""
    course_id: int
    course_name: str = ""
    level_name: str = ""
    status: ProposalStatus
    amount: Money
    review_note: str | None
    enrollment_id: int | None
    created_at: datetime
    reviewed_at: datetime | None


class RenewalOption(BaseModel):
    """A graduated matrícula and where it leads."""

    from_enrollment_id: int
    from_course_name: str
    current_level_name: str
    next_level_name: str
    amount: Money
    courses: list[RenewalCourseOption]
    #: The latest request from this matrícula, pending or rejected — what the
    #: student already did about it.
    request: RenewalRequestRead | None = None


class RenewalOptions(BaseModel):
    #: Why the student cannot ask right now (`"delinquent"`), or None.
    blocked_reason: str | None = None
    options: list[RenewalOption] = Field(default_factory=list)


class RenewalRequestCreate(BaseModel):
    from_enrollment_id: int
    course_id: int


class RenewalReview(BaseModel):
    note: str | None = Field(default=None, max_length=500)
