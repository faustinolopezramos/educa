"""Webhook signature verification.

Rejecting everything would pass a "fail closed" test while quietly breaking the
integration forever, so these tests pin down both directions: a genuine
provider call is processed, and everything else is refused.
"""

import hashlib
import hmac
import time

import pytest

from app.core.config import settings
from app.models import MeetingStatus

SECRET = "test-webhook-secret"


@pytest.fixture
def secret(monkeypatch):
    monkeypatch.setattr(settings, "webhook_secret", SECRET)
    return SECRET


@pytest.fixture
def zoom_meeting(db, world):
    """A meeting Zoom can refer to by its external id."""
    meeting = world["meeting_a"]
    meeting.external_meeting_id = "zoom-123"
    db.flush()
    return meeting


def zoom_headers(
    body: bytes, timestamp: str | None = None, secret: str = SECRET
) -> dict:
    # Default to "just now": the receiver refuses signatures older than a few
    # minutes, so a fixed timestamp would rot into a failing test.
    timestamp = timestamp or str(int(time.time()))
    message = b"v0:" + timestamp.encode() + b":" + body
    digest = hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()
    return {
        "x-zm-request-timestamp": timestamp,
        "x-zm-signature": f"v0={digest}",
        "content-type": "application/json",
    }


# ---------------- The integration must actually work ----------------
def test_a_correctly_signed_zoom_event_is_processed(client, secret, zoom_meeting):
    body = b'{"event":"meeting.ended","object":{"id":"zoom-123"}}'
    res = client.post("/webhooks/zoom", content=body, headers=zoom_headers(body))
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "ok"
    assert zoom_meeting.status is MeetingStatus.ended


def test_a_signed_recording_event_stores_the_url(client, secret, zoom_meeting):
    body = (
        b'{"event":"recording.completed","object":'
        b'{"id":"zoom-123","share_url":"https://zoom.us/rec/abc"}}'
    )
    res = client.post("/webhooks/zoom", content=body, headers=zoom_headers(body))
    assert res.status_code == 200
    assert zoom_meeting.recording_url == "https://zoom.us/rec/abc"


def test_a_signed_google_channel_token_is_accepted(client, secret, zoom_meeting):
    res = client.post(
        "/webhooks/google",
        json={"event": "meeting.ended", "id": "zoom-123"},
        headers={"x-goog-channel-token": SECRET},
    )
    assert res.status_code == 200


# ---------------- ...and reject everything else ----------------
def test_a_tampered_body_is_rejected(client, secret, zoom_meeting):
    body = b'{"event":"meeting.ended","object":{"id":"zoom-123"}}'
    headers = zoom_headers(body)
    tampered = b'{"event":"meeting.ended","object":{"id":"zoom-999"}}'
    res = client.post("/webhooks/zoom", content=tampered, headers=headers)
    assert res.status_code == 401
    assert zoom_meeting.status is MeetingStatus.scheduled


def test_a_signature_from_the_wrong_secret_is_rejected(client, secret, zoom_meeting):
    body = b'{"event":"meeting.ended","object":{"id":"zoom-123"}}'
    res = client.post(
        "/webhooks/zoom", content=body, headers=zoom_headers(body, secret="attacker")
    )
    assert res.status_code == 401


def test_a_missing_timestamp_is_rejected(client, secret, zoom_meeting):
    body = b'{"event":"meeting.ended","object":{"id":"zoom-123"}}'
    headers = zoom_headers(body)
    del headers["x-zm-request-timestamp"]
    assert client.post("/webhooks/zoom", content=body, headers=headers).status_code == 401


def test_a_replayed_event_is_rejected_even_though_it_is_signed(
    client, secret, zoom_meeting
):
    """A captured delivery stays perfectly signed forever; age is what stops it."""
    body = b'{"event":"meeting.ended","object":{"id":"zoom-123"}}'
    stale = str(int(time.time()) - 3600)
    res = client.post(
        "/webhooks/zoom", content=body, headers=zoom_headers(body, timestamp=stale)
    )
    assert res.status_code == 401
    assert zoom_meeting.status is MeetingStatus.scheduled


def test_a_timestamp_from_the_future_is_rejected(client, secret, zoom_meeting):
    body = b'{"event":"meeting.ended","object":{"id":"zoom-123"}}'
    ahead = str(int(time.time()) + 3600)
    res = client.post(
        "/webhooks/zoom", content=body, headers=zoom_headers(body, timestamp=ahead)
    )
    assert res.status_code == 401


def test_an_unparsable_timestamp_is_rejected(client, secret, zoom_meeting):
    body = b'{"event":"meeting.ended","object":{"id":"zoom-123"}}'
    res = client.post(
        "/webhooks/zoom", content=body, headers=zoom_headers(body, timestamp="tomorrow")
    )
    assert res.status_code == 401


def test_a_wrong_google_token_is_rejected(client, secret, zoom_meeting):
    res = client.post(
        "/webhooks/google",
        json={"event": "meeting.ended", "id": "zoom-123"},
        headers={"x-goog-channel-token": "guess"},
    )
    assert res.status_code == 401


def test_teams_has_no_verification_so_nothing_is_trusted(client, secret, zoom_meeting):
    body = b'{"event":"meeting.ended","object":{"id":"zoom-123"}}'
    res = client.post("/webhooks/teams", content=body, headers=zoom_headers(body))
    assert res.status_code == 401


def test_without_a_configured_secret_even_a_valid_shape_is_rejected(
    client, monkeypatch, zoom_meeting
):
    monkeypatch.setattr(settings, "webhook_secret", "")
    body = b'{"event":"meeting.ended","object":{"id":"zoom-123"}}'
    res = client.post("/webhooks/zoom", content=body, headers=zoom_headers(body))
    assert res.status_code == 401


def test_a_signed_but_malformed_body_is_a_400_not_a_crash(client, secret):
    body = b"not json at all"
    res = client.post("/webhooks/zoom", content=body, headers=zoom_headers(body))
    assert res.status_code == 400
