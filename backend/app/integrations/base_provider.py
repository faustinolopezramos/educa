"""Abstract meeting provider interface (Strategy pattern).

Every video provider (manual, Zoom, Google Meet, Teams) implements this
interface so the rest of the app never depends on a concrete provider.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime


@dataclass
class MeetingDetails:
    """Normalized result of creating/fetching a meeting across providers."""

    external_meeting_id: str | None = None
    join_url: str | None = None
    host_url: str | None = None
    recording_url: str | None = None


class BaseMeetingProvider(ABC):
    """Interface all concrete providers must implement.

    ``credentials`` is the decrypted credential dict for the provider
    (``None`` for the manual provider).
    """

    def __init__(self, credentials: dict | None = None) -> None:
        self.credentials = credentials or {}

    @abstractmethod
    def create_meeting(
        self,
        *,
        topic: str,
        start_time: datetime,
        duration_minutes: int,
        join_url: str | None = None,
    ) -> MeetingDetails:
        """Create a meeting with the provider and return normalized details."""

    @abstractmethod
    def get_meeting(self, external_meeting_id: str) -> MeetingDetails:
        """Fetch current details (e.g. recording URL) for a meeting."""

    @abstractmethod
    def delete_meeting(self, external_meeting_id: str) -> None:
        """Cancel/delete a meeting with the provider."""
