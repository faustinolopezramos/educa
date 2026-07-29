from datetime import datetime, timezone
import pytest

from app.integrations.base_provider import MeetingDetails
from app.integrations.manual_provider import ManualProvider
from app.integrations.zoom_provider import ZoomProvider
from app.integrations.google_provider import GoogleProvider
from app.models import MeetingProvider, ProviderName


def test_manual_provider_echoes_url():
    provider = ManualProvider()
    now = datetime.now(timezone.utc)
    details = provider.create_meeting(
        topic="Test Class",
        start_time=now,
        duration_minutes=45,
        join_url="https://meet.jit.si/test-room",
    )
    assert isinstance(details, MeetingDetails)
    assert details.join_url == "https://meet.jit.si/test-room"


def test_zoom_provider_requires_credentials():
    provider = ZoomProvider(credentials={})
    now = datetime.now(timezone.utc)
    with pytest.raises(ValueError, match="Credenciales de Zoom"):
        provider.create_meeting(
            topic="Test Zoom",
            start_time=now,
            duration_minutes=60,
        )


def test_google_provider_creates_headers():
    provider = GoogleProvider(credentials={"access_token": "mock_token_123"})
    headers = provider._get_headers()
    assert headers["Authorization"] == "Bearer mock_token_123"
