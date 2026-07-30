"""The academy's own wall clock.

Dates that describe school life — a payment's due date, the day a report covers,
whether a make-up class is in the past — are days on the calendar hanging in the
office, not instants on the server. Reading them off the host's clock works only
while the host happens to sit in the same zone; on a UTC deployment it shifted
every one of them by the offset.

`settings.academy_timezone` is the single place that zone is configured, and
these two helpers are the single way to ask it what time it is.
"""

from __future__ import annotations

from datetime import date, datetime
from zoneinfo import ZoneInfo

from app.core.config import settings


def academy_tz() -> ZoneInfo:
    return ZoneInfo(settings.academy_timezone)


def academy_now() -> datetime:
    """The current instant, as a timezone-aware datetime in the academy's zone."""
    return datetime.now(academy_tz())


def academy_today() -> date:
    """Today on the academy's calendar."""
    return academy_now().date()
