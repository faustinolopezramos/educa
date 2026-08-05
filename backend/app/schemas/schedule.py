from datetime import date, time
from typing import ClassVar

from pydantic import BaseModel, ConfigDict, model_validator

from app.models.enums import (
    MODALITY_LABELS,
    MODALITY_NEEDS_LINK,
    MODALITY_USES_ROOM,
    Modality,
    ProviderName,
)
from app.schemas.base import PatchModel


class ScheduleCreate(BaseModel):
    course_id: int
    teacher_id: int
    room_id: int | None = None
    day_of_week: int  # 0=Monday .. 6=Sunday
    start_time: time
    end_time: time
    # Cómo se imparte la clase, decidido por dirección al crearla.
    #
    # No estaba aquí, y Pydantic descarta lo que no declara: el asistente de
    # cursos enviaba `modality` y `join_url` en cada horario y ambos se perdían
    # en el camino, así que **toda** franja nacía presencial sin enlace, dijera
    # lo que dijera el formulario. La modalidad sólo podía arreglarse después,
    # una por una, por el flujo de propuesta de ubicación.
    modality: Modality = Modality.presencial
    join_url: str | None = None
    provider: ProviderName | None = None

    @model_validator(mode="after")
    def _check_times(self) -> "ScheduleCreate":
        if self.start_time >= self.end_time:
            raise ValueError("start_time must be before end_time")
        if not 0 <= self.day_of_week <= 6:
            raise ValueError("day_of_week must be between 0 (Mon) and 6 (Sun)")
        return self

    @model_validator(mode="after")
    def _coherent_location(self) -> "ScheduleCreate":
        """Que la ubicación no se contradiga con la modalidad.

        Deliberadamente **no exige** aula ni enlace: un horario puede crearse
        antes de saber dónde se dará, y para eso existe el flujo de propuesta.
        Lo que sí se rechaza es lo incoherente — un enlace colgando de una clase
        presencial, o un aula reservada por una virtual que nadie va a pisar —
        porque eso no es información incompleta, es información equivocada.
        """
        if self.modality not in MODALITY_NEEDS_LINK and self.join_url:
            raise ValueError(
                f"Una clase {MODALITY_LABELS[self.modality].lower()} no lleva "
                "enlace de conexión"
            )
        if self.modality not in MODALITY_USES_ROOM and self.room_id is not None:
            raise ValueError(
                f"Una clase {MODALITY_LABELS[self.modality].lower()} no reserva aula"
            )
        if self.join_url and self.provider is None:
            self.provider = ProviderName.manual
        return self


class ScheduleUpdate(PatchModel):
    # room_id is nullable: null legitimately means "no room / online".
    NON_NULLABLE: ClassVar[tuple[str, ...]] = (
        "course_id",
        "teacher_id",
        "day_of_week",
        "start_time",
        "end_time",
    )
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
    modality: Modality
    join_url: str | None
    provider: ProviderName | None


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
