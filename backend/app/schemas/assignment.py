from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from app.schemas.base import PatchModel
from app.schemas.user import UserBrief


def _validate_safe_url(v: str | None) -> str | None:
    if v is None:
        return None
    cleaned = v.strip()
    if not cleaned:
        return None
    # Allow attachments format or standard web URLs
    if cleaned.startswith("attachment://"):
        return cleaned
    if not (cleaned.startswith("http://") or cleaned.startswith("https://")):
        raise ValueError("La URL debe comenzar con http:// o https://")
    return cleaned


class AssignmentBase(BaseModel):
    course_id: int
    title: str = Field(..., max_length=200)
    description: str | None = None
    resource_url: str | None = Field(None, max_length=500)
    due_date: datetime | None = None

    @field_validator("resource_url")
    @classmethod
    def validate_resource_url(cls, v: str | None) -> str | None:
        return _validate_safe_url(v)


class AssignmentCreate(AssignmentBase):
    pass


class AssignmentRead(AssignmentBase):
    id: int
    tenant_id: int | None = None
    created_at: datetime

    class Config:
        from_attributes = True


class SubmissionCreate(BaseModel):
    content: str | None = None
    submission_url: str | None = Field(None, max_length=500)

    @field_validator("submission_url")
    @classmethod
    def validate_submission_url(cls, v: str | None) -> str | None:
        return _validate_safe_url(v)


class SubmissionGrade(PatchModel):
    score: float = Field(..., ge=0.0, le=10.0)
    feedback: str | None = None


class SubmissionRead(BaseModel):
    id: int
    assignment_id: int
    student_id: int
    content: str | None = None
    submission_url: str | None = None
    submitted_at: datetime
    status: str
    score: float | None = None
    feedback: str | None = None
    is_late: bool = False
    student: UserBrief | None = None

    class Config:
        from_attributes = True


class RosterStudentStatus(BaseModel):
    student_id: int
    full_name: str
    status: str  # not_submitted, submitted, submitted_late, graded
    submission_id: int | None = None
    submitted_at: datetime | None = None
    content: str | None = None
    submission_url: str | None = None
    score: float | None = None
    feedback: str | None = None
    is_late: bool = False
