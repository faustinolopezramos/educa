from pydantic import BaseModel, ConfigDict, model_validator

from app.models.enums import Modality, ProposalStatus, ProviderName


class LocationProposalCreate(BaseModel):
    """A teacher's (or admin's) proposed location for a schedule."""

    modality: Modality
    room_id: int | None = None
    provider: ProviderName | None = None
    join_url: str | None = None

    @model_validator(mode="after")
    def _coherent(self) -> "LocationProposalCreate":
        if self.modality == Modality.virtual:
            if not self.join_url:
                raise ValueError("Una clase virtual necesita un enlace (join_url)")
            if self.provider is None:
                self.provider = ProviderName.manual
        else:  # presencial
            if self.room_id is None:
                raise ValueError("Una clase presencial necesita un aula (room_id)")
            # A physical class has no link/provider.
            self.join_url = None
            self.provider = None
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
