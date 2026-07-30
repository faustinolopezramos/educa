"""Dates that describe school life are read on the academy's calendar.

A due date, the day a report covers, whether a make-up class is already in the
past — all of these are days on the wall calendar of the school, not instants on
the server. Read off the host clock instead, a UTC deployment shifted every one
of them by the offset: with the academy in `America/Guatemala` (UTC-6), the
server rolls over to tomorrow at 18:00 local, so for six hours every evening the
two disagree about what day it is.
"""

from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import app.core.clock as clock
from app.core.clock import academy_now, academy_today
from app.services.finance import derive_payment_status


def test_the_academy_clock_follows_the_configured_zone(monkeypatch):
    monkeypatch.setattr(clock.settings, "academy_timezone", "America/Guatemala")
    assert academy_now().tzinfo == ZoneInfo("America/Guatemala")
    assert academy_today() == datetime.now(ZoneInfo("America/Guatemala")).date()


def test_the_academy_clock_is_not_the_server_clock(monkeypatch):
    """Pinned with a zone far enough away that the two dates cannot coincide:
    Kiritimati is UTC+14, so it is always a day ahead of UTC for ten hours."""
    monkeypatch.setattr(clock.settings, "academy_timezone", "Pacific/Kiritimati")
    kiritimati = academy_today()
    utc = datetime.now(timezone.utc).date()
    assert kiritimati - utc in (timedelta(0), timedelta(days=1))
    assert kiritimati == datetime.now(ZoneInfo("Pacific/Kiritimati")).date()


def test_delinquency_is_judged_on_the_academys_calendar(client, world, db):
    """`derive_payment_status` defaulted to `date.today()`, so on a UTC host a
    charge fell into arrears hours before the office it belongs to had reached
    the due date at all."""
    from app.models import Payment, PaymentKind, PaymentStatus

    enrollment = world["enrollment"]
    enrollment.amount = 100.0
    db.add(
        Payment(
            enrollment_id=enrollment.id,
            kind=PaymentKind.charge,
            amount=100.0,
            due_date=date(2030, 6, 15),
        )
    )
    db.flush()

    # The day before it falls due: owed, but not yet delinquent.
    assert (
        derive_payment_status(db, enrollment, on=date(2030, 6, 14))
        is PaymentStatus.pending
    )
    # On and after the due date, it is en mora.
    assert (
        derive_payment_status(db, enrollment, on=date(2030, 6, 15))
        is PaymentStatus.overdue
    )


def test_the_default_asks_the_academy_clock_not_the_host(
    client, world, db, monkeypatch
):
    """With no explicit `on`, the boundary has to come from `academy_today()`."""
    from app.models import Payment, PaymentKind, PaymentStatus

    enrollment = world["enrollment"]
    enrollment.amount = 100.0
    db.add(
        Payment(
            enrollment_id=enrollment.id,
            kind=PaymentKind.charge,
            amount=100.0,
            due_date=date(2020, 1, 1),
        )
    )
    db.flush()

    import app.services.finance as finance

    # A clock stuck before the due date must keep the charge out of arrears,
    # whatever day the machine running the tests thinks it is.
    monkeypatch.setattr(finance, "academy_today", lambda: date(2019, 12, 31))
    assert derive_payment_status(db, enrollment) is PaymentStatus.pending

    monkeypatch.setattr(finance, "academy_today", lambda: date(2020, 1, 1))
    assert derive_payment_status(db, enrollment) is PaymentStatus.overdue
