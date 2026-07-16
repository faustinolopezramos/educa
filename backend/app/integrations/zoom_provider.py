"""Zoom provider skeleton.

Phase 1 leaves this unimplemented. To enable real Zoom meetings:
  1. Create a Server-to-Server OAuth app in the Zoom Marketplace.
  2. Store {account_id, client_id, client_secret} as this provider's
     encrypted credentials.
  3. Implement the methods below using httpx against the Zoom REST API.
"""

from __future__ import annotations

from datetime import datetime

from app.integrations.base_provider import BaseMeetingProvider, MeetingDetails


class ZoomProvider(BaseMeetingProvider):
    def create_meeting(
        self,
        *,
        topic: str,
        start_time: datetime,
        duration_minutes: int,
        join_url: str | None = None,
    ) -> MeetingDetails:
        # TODO: obtain S2S OAuth token, POST /users/me/meetings, map response
        #       to MeetingDetails(external_meeting_id, join_url, host_url).
        raise NotImplementedError("Zoom integration not implemented yet")

    def get_meeting(self, external_meeting_id: str) -> MeetingDetails:
        # TODO: GET /meetings/{id} and /meetings/{id}/recordings.
        raise NotImplementedError("Zoom integration not implemented yet")

    def delete_meeting(self, external_meeting_id: str) -> None:
        # TODO: DELETE /meetings/{id}.
        raise NotImplementedError("Zoom integration not implemented yet")
