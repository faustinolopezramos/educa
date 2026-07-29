"""Deriving an enrollment's payment status from its ledger.

`Enrollment.payment_status` is a cached summary of the `Payment` rows beneath
it, and this module is the only place allowed to compute it — so "pagado",
"pendiente" and "en mora" mean exactly one thing across the app.

The three states, in the business's own terms:

* ``paid``    — nothing is owed: everything charged has been received.
* ``overdue`` — something owed is *past its due date* (en mora).
* ``pending`` — something is owed but nothing has fallen due yet.

Note the asymmetry with `Payment.due_date`: a charge with no due date can never
turn the enrollment delinquent, because nobody ever agreed on a date to miss.
"""

from __future__ import annotations

from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Enrollment, EnrollmentStatus, Payment, PaymentKind, PaymentStatus

# Money is stored as a float, so an exact `paid >= charged` comparison can trip
# on the last binary digit (0.1 + 0.2 owed against 0.3 paid). A hundredth of a
# currency unit is below anything the academy can actually collect.
_EPSILON = 0.005


def enrollment_balance(db: Session, enrollment_id: int) -> tuple[float, float]:
    """`(charged, paid)` for one enrollment, straight from the ledger."""
    rows = db.scalars(
        select(Payment).where(Payment.enrollment_id == enrollment_id)
    ).all()
    charged = sum(p.amount for p in rows if p.kind == PaymentKind.charge)
    paid = sum(p.amount for p in rows if p.kind == PaymentKind.payment)
    return charged, paid


def derive_payment_status(
    db: Session, enrollment: Enrollment, *, on: date | None = None
) -> PaymentStatus:
    """What `enrollment.payment_status` should be right now, without writing it."""
    today = on or date.today()
    charged, paid = enrollment_balance(db, enrollment.id)

    # An enrollment whose ledger was never opened falls back to the agreed
    # cuota, so a fee recorded only on the enrollment still counts as owed.
    owed = (charged if charged > 0 else enrollment.amount) - paid
    if owed <= _EPSILON:
        return PaymentStatus.paid

    # Delinquent as soon as the charges already due exceed what has been paid:
    # a payment covers the oldest debt first, so anything still uncovered by
    # today's due charges is money that should already have arrived.
    due_charges = sum(
        p.amount
        for p in db.scalars(
            select(Payment).where(
                Payment.enrollment_id == enrollment.id,
                Payment.kind == PaymentKind.charge,
                Payment.due_date.isnot(None),
                Payment.due_date <= today,
            )
        ).all()
    )
    if due_charges - paid > _EPSILON:
        return PaymentStatus.overdue

    return PaymentStatus.pending


def refresh_payment_status(
    db: Session, enrollment: Enrollment, *, on: date | None = None
) -> PaymentStatus:
    """Recompute and store the status. Does not commit — the caller's does."""
    enrollment.payment_status = derive_payment_status(db, enrollment, on=on)
    return enrollment.payment_status


def refresh_all_payment_statuses(db: Session, *, on: date | None = None) -> int:
    """Re-derive every live enrollment's status; returns how many changed.

    Delinquency is the one status that arrives by the calendar rather than by
    someone touching the record, so without a periodic sweep an enrollment that
    quietly went past due would keep reporting itself as `pending`. Exposed as
    an admin endpoint (`POST /payments/refresh-statuses`) so it can be driven
    by cron until there is a real scheduler.
    """
    live = db.scalars(
        select(Enrollment).where(
            Enrollment.status.in_([EnrollmentStatus.active, EnrollmentStatus.enrolled])
        )
    ).all()
    changed = 0
    for enrollment in live:
        previous = enrollment.payment_status
        if refresh_payment_status(db, enrollment, on=on) is not previous:
            changed += 1
    return changed
