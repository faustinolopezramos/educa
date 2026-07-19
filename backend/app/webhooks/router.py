"""Webhook receivers for meeting providers.

These endpoints are unauthenticated in the usual sense: the caller is a
provider, not a logged-in user. The only thing standing between the internet
and our meeting rows is signature verification, so this module **fails closed** —
a request whose signature cannot be verified is rejected, including when no
`WEBHOOK_SECRET` is configured at all.
"""

import hashlib
import hmac
import json
import logging
import time
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.models import MeetingStatus, ProviderName, VirtualMeeting

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/webhooks", tags=["webhooks"])

# A signature stays valid forever, so a captured request could be replayed to
# re-end a meeting or restore a stale recording URL. Zoom signs the timestamp
# along with the body, which lets us refuse anything too old to be in flight.
_MAX_TIMESTAMP_SKEW_SECONDS = 5 * 60

_unauthorized = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid webhook signature"
)


def _timestamp_is_fresh(raw: str) -> bool:
    """Whether a signed timestamp is recent enough to be a live delivery.

    Zoom sends seconds since the epoch. Anything outside the window — in either
    direction, since a future timestamp is just as unexplainable — is refused.
    """
    try:
        sent_at = int(raw)
    except (TypeError, ValueError):
        return False
    return abs(time.time() - sent_at) <= _MAX_TIMESTAMP_SKEW_SECONDS


def _signature_is_valid(provider: ProviderName, request: Request, body: bytes) -> bool:
    """Verify the provider's signature over the raw request body.

    Every branch returns False rather than raising, so an unknown or malformed
    header can never be mistaken for a valid signature.
    """
    secret = settings.webhook_secret
    if not secret:
        logger.warning(
            "Rejected %s webhook: WEBHOOK_SECRET is not configured", provider.value
        )
        return False

    if provider is ProviderName.zoom:
        # Zoom signs "v0:<timestamp>:<raw body>" and sends "v0=<hex digest>".
        signature = request.headers.get("x-zm-signature")
        timestamp = request.headers.get("x-zm-request-timestamp")
        if not signature or not timestamp:
            return False
        if not _timestamp_is_fresh(timestamp):
            logger.warning("Rejected zoom webhook: stale or unparsable timestamp")
            return False
        message = b"v0:" + timestamp.encode() + b":" + body
        expected = "v0=" + hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()
        return hmac.compare_digest(expected, signature)

    if provider is ProviderName.google:
        # Google Calendar push channels echo back the token we registered.
        token = request.headers.get("x-goog-channel-token")
        return bool(token) and hmac.compare_digest(secret, token)

    # Teams has no provider implementation yet, so nothing may be trusted.
    return False


def _find_meeting(db: Session, external_id: str | None) -> VirtualMeeting | None:
    if not external_id:
        return None
    return db.scalar(
        select(VirtualMeeting).where(
            VirtualMeeting.external_meeting_id == external_id
        )
    )


@router.post("/{provider}")
async def receive_webhook(
    provider: ProviderName,
    request: Request,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    # The manual provider is a URL we paste by hand; it never calls back.
    if provider is ProviderName.manual:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")

    body = await request.body()
    if not _signature_is_valid(provider, request, body):
        raise _unauthorized

    try:
        payload = json.loads(body)
    except json.JSONDecodeError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Malformed JSON body")
    if not isinstance(payload, dict):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Expected a JSON object")

    # Normalize the two events we care about. Providers differ in shape; this
    # is a best-effort extraction to be refined per provider.
    obj = payload.get("object")
    obj = obj if isinstance(obj, dict) else {}
    event = payload.get("event") or payload.get("type")
    external_id = payload.get("meeting_id") or obj.get("id") or payload.get("id")
    meeting = _find_meeting(db, str(external_id) if external_id else None)

    if meeting is None:
        return {"status": "ignored", "reason": "meeting not found"}

    if event in {"meeting.ended", "ended"}:
        meeting.status = MeetingStatus.ended
    elif event in {"recording.completed", "recording_ready"}:
        recording_url = payload.get("recording_url") or obj.get("share_url")
        if recording_url:
            meeting.recording_url = recording_url

    db.commit()
    return {"status": "ok", "meeting_id": meeting.id}
