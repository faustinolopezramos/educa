"""Manual provider: the teacher pastes a Zoom/Meet/Teams URL by hand.

This is the default provider for Phase 1. No external API calls are made;
we simply persist the URL the teacher supplies.
"""

from __future__ import annotations

from datetime import datetime

from app.integrations.base_provider import BaseMeetingProvider, MeetingDetails


class ManualProvider(BaseMeetingProvider):
    def create_meeting(
        self,
        *,
        topic: str,
        start_time: datetime,
        duration_minutes: int,
        join_url: str | None = None,
    ) -> MeetingDetails:
        # Nothing to call externally; just echo back the pasted URL.
        return MeetingDetails(join_url=join_url, host_url=join_url)

    def get_meeting(self, external_meeting_id: str) -> MeetingDetails:
        # No external state to fetch for a manually-entered meeting.
        return MeetingDetails()

    def delete_meeting(self, external_meeting_id: str) -> None:
        # No external resource to release.
        return None
