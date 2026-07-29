"""Google Meet provider implementation via Google Calendar API v3."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import uuid
import httpx

from app.integrations.base_provider import BaseMeetingProvider, MeetingDetails


class GoogleProvider(BaseMeetingProvider):
    """Google Meet provider using Google Calendar API v3.

    Credentials dict structure:
        {
            "access_token": "...",       # Optional OAuth access token
            "calendar_id": "primary",    # Calendar ID (default: primary)
            "api_key": "..."             # Optional API key
        }
    """

    GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3"

    def _get_headers(self) -> dict[str, str]:
        headers = {"Content-Type": "application/json"}
        token = self.credentials.get("access_token")
        if token:
            headers["Authorization"] = f"Bearer {token}"
        return headers

    def create_meeting(
        self,
        *,
        topic: str,
        start_time: datetime,
        duration_minutes: int,
        join_url: str | None = None,
    ) -> MeetingDetails:
        headers = self._get_headers()
        calendar_id = self.credentials.get("calendar_id", "primary")

        start_iso = start_time.astimezone(timezone.utc).isoformat()
        end_iso = (
            (start_time + timedelta(minutes=duration_minutes))
            .astimezone(timezone.utc)
            .isoformat()
        )

        body = {
            "summary": topic,
            "description": "Clase virtual de Educa",
            "start": {"dateTime": start_iso},
            "end": {"dateTime": end_iso},
            "conferenceData": {
                "createRequest": {
                    "requestId": str(uuid.uuid4()),
                    "conferenceSolutionKey": {"type": "hangoutsMeet"},
                }
            },
        }

        params = {"conferenceDataVersion": 1}
        api_key = self.credentials.get("api_key")
        if api_key:
            params["key"] = api_key

        url = f"{self.GOOGLE_CALENDAR_API}/calendars/{calendar_id}/events"
        res = httpx.post(url, json=body, headers=headers, params=params, timeout=10.0)
        res.raise_for_status()
        data = res.json()

        hangout_link = data.get("hangoutLink")
        event_id = data.get("id")

        return MeetingDetails(
            external_meeting_id=str(event_id),
            join_url=hangout_link or join_url,
            host_url=hangout_link or join_url,
        )

    def get_meeting(self, external_meeting_id: str) -> MeetingDetails:
        headers = self._get_headers()
        calendar_id = self.credentials.get("calendar_id", "primary")

        url = f"{self.GOOGLE_CALENDAR_API}/calendars/{calendar_id}/events/{external_meeting_id}"
        res = httpx.get(url, headers=headers, timeout=10.0)
        res.raise_for_status()
        data = res.json()

        hangout_link = data.get("hangoutLink")
        return MeetingDetails(
            external_meeting_id=str(data.get("id")),
            join_url=hangout_link,
            host_url=hangout_link,
        )

    def delete_meeting(self, external_meeting_id: str) -> None:
        headers = self._get_headers()
        calendar_id = self.credentials.get("calendar_id", "primary")

        url = f"{self.GOOGLE_CALENDAR_API}/calendars/{calendar_id}/events/{external_meeting_id}"
        httpx.delete(url, headers=headers, timeout=10.0)
