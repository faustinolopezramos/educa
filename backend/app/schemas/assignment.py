from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.base import PatchModel
from app.schemas.user import UserBrief


class AssignmentBase(BaseModel):
    course_id: int
    title: str = Field(..., max_length=200)
    description: str | None = None
    resource_url: str | None = Field(None, max_length=500)
    due_date: datetime | None = None


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
