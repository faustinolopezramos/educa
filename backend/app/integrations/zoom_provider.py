"""Zoom provider implementation via Zoom Server-to-Server OAuth REST API v2."""

from __future__ import annotations

import base64
from datetime import datetime, timezone
import httpx

from app.integrations.base_provider import BaseMeetingProvider, MeetingDetails


class ZoomProvider(BaseMeetingProvider):
    """Server-to-Server OAuth provider for Zoom.

    Credentials dict structure:
        {
            "account_id": "...",
            "client_id": "...",
            "client_secret": "..."
        }
    """

    ZOOM_OAUTH_URL = "https://zoom.us/oauth/token"
    ZOOM_API_BASE = "https://api.zoom.us/v2"

    def _get_access_token(self) -> str:
        account_id = self.credentials.get("account_id")
        client_id = self.credentials.get("client_id")
        client_secret = self.credentials.get("client_secret")

        if not account_id or not client_id or not client_secret:
            raise ValueError(
                "Credenciales de Zoom incompletas. Se requieren account_id, client_id y client_secret."
            )

        auth_header = base64.b64encode(
            f"{client_id}:{client_secret}".encode("utf-8")
        ).decode("utf-8")

        response = httpx.post(
            f"{self.ZOOM_OAUTH_URL}?grant_type=account_credentials&account_id={account_id}",
            headers={
                "Authorization": f"Basic {auth_header}",
                "Content-Type": "application/x-www-form-urlencoded",
            },
            timeout=10.0,
        )
        response.raise_for_status()
        data = response.json()
        return data["access_token"]

    def create_meeting(
        self,
        *,
        topic: str,
        start_time: datetime,
        duration_minutes: int,
        join_url: str | None = None,
    ) -> MeetingDetails:
        token = self._get_access_token()
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }

        # Format start_time in ISO-8601 UTC
        iso_start = start_time.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

        body = {
            "topic": topic,
            "type": 2,  # Scheduled meeting
            "start_time": iso_start,
            "duration": duration_minutes,
            "settings": {
                "host_video": True,
                "participant_video": True,
                "join_before_host": False,
                "mute_upon_entry": True,
                "waiting_room": True,
            },
        }

        res = httpx.post(
            f"{self.ZOOM_API_BASE}/users/me/meetings",
            json=body,
            headers=headers,
            timeout=10.0,
        )
        res.raise_for_status()
        data = res.json()

        return MeetingDetails(
            external_meeting_id=str(data.get("id")),
            join_url=data.get("join_url"),
            host_url=data.get("start_url"),
        )

    def get_meeting(self, external_meeting_id: str) -> MeetingDetails:
        token = self._get_access_token()
        headers = {"Authorization": f"Bearer {token}"}

        res = httpx.get(
            f"{self.ZOOM_API_BASE}/meetings/{external_meeting_id}",
            headers=headers,
            timeout=10.0,
        )
        res.raise_for_status()
        data = res.json()

        recording_url = None
        # Best effort attempt to fetch recording URL if available
        rec_res = httpx.get(
            f"{self.ZOOM_API_BASE}/meetings/{external_meeting_id}/recordings",
            headers=headers,
            timeout=5.0,
        )
        if rec_res.status_code == 200:
            rec_data = rec_res.json()
            recording_url = rec_data.get("share_url")

        return MeetingDetails(
            external_meeting_id=str(data.get("id")),
            join_url=data.get("join_url"),
            host_url=data.get("start_url"),
            recording_url=recording_url,
        )

    def delete_meeting(self, external_meeting_id: str) -> None:
        token = self._get_access_token()
        headers = {"Authorization": f"Bearer {token}"}

        httpx.delete(
            f"{self.ZOOM_API_BASE}/meetings/{external_meeting_id}",
            headers=headers,
            timeout=10.0,
        )
