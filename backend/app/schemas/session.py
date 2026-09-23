from datetime import date, datetime, time
from typing import ClassVar

from pydantic import BaseModel, ConfigDict

from app.models.enums import AttendanceStatus, MakeUpStatus, Modality, SessionStatus
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


# ---------------- La jornada y la clase, en una sola llamada ----------------
#
# Estas dos formas existen porque las pantallas del profesor las pedían a trozos:
# la agenda cruzaba sesiones, horarios, cursos, aulas y asistencia desde el
# navegador —una consulta por clase— y la lista del día volvía a hacerlo por
# alumno. Cada una devuelve exactamente lo que su pantalla dibuja.


class AgendaEntry(BaseModel):
    """Una clase en la jornada: cuándo, dónde, y cuánto falta por hacer."""

    model_config = ConfigDict(from_attributes=True)

    session_id: int
    schedule_id: int
    course_id: int
    course_name: str
    level_name: str | None = None
    date: date
    start_time: time
    end_time: time
    status: SessionStatus
    #: La lista se dio por terminada. `status` sólo dice si la clase ocurrió.
    register_closed: bool
    modality: Modality
    room_name: str | None = None
    teacher_id: int
    teacher_name: str
    #: Quienes ocupan plaza en el curso, que son los que hay que marcar.
    students_total: int
    students_marked: int
    #: Alumnos de otro grupo que vienen a recuperar en esta sesión.
    makeup_visitors: int
    #: Si *este* usuario puede cerrar la lista. Marcar asistencia lo hace quien
    #: imparte el curso, pero cerrar es del profesor titular de la franja, así
    #: que la pantalla necesita saberlo para no ofrecer un botón que la API va a
    #: rechazar.
    can_close_register: bool = False


class BoardStudent(BaseModel):
    enrollment_id: int
    student_id: int
    full_name: str
    enrollment_code: str
    #: La marca de esta sesión, o None si todavía no tiene.
    mark: AttendanceStatus | None = None


class BoardVisitor(BaseModel):
    credit_id: int
    student_id: int
    full_name: str
    origin_course_name: str | None = None
    status: MakeUpStatus


class ClassBoard(BaseModel):
    """Todo lo que la pantalla de pasar lista necesita."""

    session: AgendaEntry
    students: list[BoardStudent]
    visitors: list[BoardVisitor]
