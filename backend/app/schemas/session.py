from datetime import date, datetime
from typing import ClassVar

from pydantic import BaseModel, ConfigDict

from app.models.enums import MakeUpStatus, SessionStatus
from app.schemas.base import PatchModel


class ClassSessionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    schedule_id: int
    date: date
    status: SessionStatus
    topic: str | None
    cancel_reason: str | None
    origin_session_id: int | None
    recording_url: str | None = None
    # Cuándo se dio la lista por terminada. `None` = todavía abierta, que es lo
    # que la interfaz usa para distinguir "sin registrar" de "registrada" —
    # `status` sólo dice si la clase ocurrió.
    register_closed_at: datetime | None = None
    register_closed_by: int | None = None


class SessionGenerate(BaseModel):
    schedule_id: int


class SessionEnsure(BaseModel):
    schedule_id: int
    date: date


class SessionCancel(BaseModel):
    reason: str | None = None


class SessionReschedule(BaseModel):
    new_date: date


class SessionUpdate(PatchModel):
    NON_NULLABLE: ClassVar[tuple[str, ...]] = ("status",)
    status: SessionStatus | None = None
    topic: str | None = None
    recording_url: str | None = None


class MakeUpVisitorRead(BaseModel):
    """Un alumno que asiste a esta sesión recuperando una clase de otro grupo.

    No tiene matrícula en este curso, así que no aparece en la lista normal: su
    presencia cuelga del pase de recuperación, y por eso se identifica por él.
    """

    model_config = ConfigDict(from_attributes=True)

    credit_id: int
    student_id: int
    student_name: str
    origin_course_name: str | None = None
    status: MakeUpStatus


class MakeUpVisitorMark(BaseModel):
    present: bool
