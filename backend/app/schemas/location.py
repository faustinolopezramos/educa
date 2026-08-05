from pydantic import BaseModel, ConfigDict, model_validator

from app.models.enums import (
    MODALITY_LABELS,
    MODALITY_NEEDS_LINK,
    MODALITY_USES_ROOM,
    Modality,
    ProposalStatus,
    ProviderName,
)


class LocationProposalCreate(BaseModel):
    """A teacher's (or admin's) proposed location for a schedule."""

    modality: Modality
    room_id: int | None = None
    provider: ProviderName | None = None
    join_url: str | None = None

    @model_validator(mode="after")
    def _coherent(self) -> "LocationProposalCreate":
        """Que la ubicación propuesta pueda realmente impartirse.

        Las tres modalidades se tratan por separado, y no como "virtual" contra
        "todo lo demás". Ese `else` era lo que dejaba a una clase **semi
        presencial** sin enlace: pedía aula y borraba el enlace en silencio, de
        modo que la mitad en línea de la clase no existía en ninguna parte y el
        alumno no tenía adónde conectarse.
        """
        needs_link = self.modality in MODALITY_NEEDS_LINK
        uses_room = self.modality in MODALITY_USES_ROOM

        if needs_link and not self.join_url:
            raise ValueError(
                f"Una clase {MODALITY_LABELS[self.modality].lower()} necesita un "
                "enlace de conexión"
            )
        if uses_room and self.room_id is None:
            raise ValueError(
                f"Una clase {MODALITY_LABELS[self.modality].lower()} necesita un aula"
            )

        # Lo que la modalidad no usa, no se guarda. Un aula reservada por una
        # clase virtual la bloquearía para quien sí la necesita, y un enlace
        # colgando de una presencial es una puerta que nadie vigila.
        if not uses_room:
            self.room_id = None
        if not needs_link:
            self.join_url = None
            self.provider = None
        elif self.provider is None:
            self.provider = ProviderName.manual
        return self


class ProposalReview(BaseModel):
    note: str | None = None


class LocationProposalRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    schedule_id: int
    proposed_by: int
    modality: Modality
    room_id: int | None
    provider: ProviderName | None
    join_url: str | None
    status: ProposalStatus
    review_note: str | None
    reviewed_by: int | None
