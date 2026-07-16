"""Google Meet provider skeleton (via Google Calendar API).

Phase 1 leaves this unimplemented. To enable real Meet links:
  1. Create a Google Cloud project, enable the Calendar API, and create a
     service account (or OAuth client) with domain-wide delegation.
  2. Store the service-account JSON as this provider's encrypted credentials.
  3. Create a Calendar event with conferenceData to get a Meet link, then map
     it to MeetingDetails(external_meeting_id=event_id, join_url=meet_link).
"""

from __future__ import annotations

from datetime import datetime

from app.integrations.base_provider import BaseMeetingProvider, MeetingDetails


class GoogleProvider(BaseMeetingProvider):
    def create_meeting(
        self,
        *,
        topic: str,
        start_time: datetime,
        duration_minutes: int,
        join_url: str | None = None,
    ) -> MeetingDetails:
        # TODO: events.insert with conferenceDataVersion=1, read hangoutLink.
        raise NotImplementedError("Google Meet integration not implemented yet")

    def get_meeting(self, external_meeting_id: str) -> MeetingDetails:
        # TODO: events.get to refresh the Meet link / status.
        raise NotImplementedError("Google Meet integration not implemented yet")

    def delete_meeting(self, external_meeting_id: str) -> None:
        # TODO: events.delete.
        raise NotImplementedError("Google Meet integration not implemented yet")
