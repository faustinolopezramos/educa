"""The academy's own wall clock.

Dates that describe school life — a payment's due date, the day a report covers,
whether a make-up class is in the past — are days on the calendar hanging in the
office, not instants on the server. Reading them off the host's clock works only
while the host happens to sit in the same zone; on a UTC deployment it shifted
every one of them by the offset.

Each academy (tenant) carries its own zone in `Tenant.timezone`; pass the
session and the academy's id to read that one. Without them — or for accounts
that belong to no academy — `settings.academy_timezone` is the zone, which is
also the fallback for a tenant whose zone is missing or unknown. These helpers
are the single way to ask what time it is.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import TYPE_CHECKING
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from app.core.config import settings

if TYPE_CHECKING:
    from sqlalchemy.orm import Session


def academy_tz(db: Session | None = None, tenant_id: int | None = None) -> ZoneInfo:
    """The zone of the academy `tenant_id`, or the installation's default."""
    if db is not None and tenant_id is not None:
        from app.models import Tenant  # evita el ciclo core → models → core

        tenant = db.get(Tenant, tenant_id)
        if tenant is not None and tenant.timezone:
            try:
                return ZoneInfo(tenant.timezone)
            except (ZoneInfoNotFoundError, ValueError):
                pass
    return ZoneInfo(settings.academy_timezone)


def academy_now(db: Session | None = None, tenant_id: int | None = None) -> datetime:
    """The current instant, as a timezone-aware datetime in the academy's zone."""
    return datetime.now(academy_tz(db, tenant_id))


def academy_today(db: Session | None = None, tenant_id: int | None = None) -> date:
    """Today on the academy's calendar."""
    return academy_now(db, tenant_id).date()
