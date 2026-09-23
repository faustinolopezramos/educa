"""Questions asked of a course's enrollments, answered in one place.

Capacity was being counted three different ways — when enrolling, when
reactivating, and when an admin lowered `max_students` — and all three counted
only `active` rows. A matrícula created straight into "Inscrito" therefore took
no seat at all, so a course with `max_students = 10` would accept an unbounded
number of them and only start refusing once someone activated them one by one.

`ENROLLMENT_OCCUPIES_SEAT` is the definition of a taken seat; this module is
where it gets counted.
"""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.models import (
    ENROLLMENT_OCCUPIES_SEAT,
    Enrollment,
    Payment,
    PaymentKind,
    Tenant,
    User,
)


def check_tenant_student_quota(
    db: Session, tenant_id: int, *, additional_seats: int = 1
) -> None:
    """Verifies that enrolling `additional_seats` won't exceed the tenant's `max_active_students` limit."""
    tenant = db.get(Tenant, tenant_id)
    if tenant is None:
        return

    stmt = (
        select(func.count())
        .select_from(Enrollment)
        .join(User, Enrollment.student_id == User.id)
        .where(
            User.tenant_id == tenant_id,
            Enrollment.status.in_(ENROLLMENT_OCCUPIES_SEAT),
        )
    )
    current_count = db.scalar(stmt) or 0
    if current_count + additional_seats > tenant.max_active_students:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": (
                    f"La academia ha alcanzado el límite de estudiantes activos contratados en su plan "
                    f"({current_count}/{tenant.max_active_students})."
                ),
                "reason": "tenant_quota_exceeded",
                "max_active_students": tenant.max_active_students,
                "current_active_students": current_count,
            },
        )



def seats_taken(
    db: Session, course_id: int, *, exclude_enrollment_id: int | None = None
) -> int:
    """How many seats of `course_id` are currently held.

    `exclude_enrollment_id` leaves one enrollment out of the count, which is what
    reactivation needs: the row being reactivated must not be compared against
    itself.
    """
    stmt = (
        select(func.count())
        .select_from(Enrollment)
        .where(
            Enrollment.course_id == course_id,
            Enrollment.status.in_(ENROLLMENT_OCCUPIES_SEAT),
        )
    )
    if exclude_enrollment_id is not None:
        stmt = stmt.where(Enrollment.id != exclude_enrollment_id)
    return db.scalar(stmt) or 0


def balances_for(
    db: Session, enrollment_ids: Sequence[int]
) -> dict[int, float]:
    """`{enrollment_id: outstanding}` for many enrollments in one query.

    "Outstanding" is `charged − paid`, the same figure `services.finance`
    derives the payment status from — negative means the student is in credit.

    One grouped query rather than a ledger call per row: the enrollments list
    renders every matrícula of a course, and doing this per row is exactly the
    N+1 that makes a list of forty students feel broken.
    """
    if not enrollment_ids:
        return {}
    signed = case(
        (Payment.kind == PaymentKind.charge, Payment.amount),
        else_=-Payment.amount,
    )
    rows = db.execute(
        select(Payment.enrollment_id, func.coalesce(func.sum(signed), 0))
        .where(Payment.enrollment_id.in_(enrollment_ids))
        .group_by(Payment.enrollment_id)
    ).all()
    return {enrollment_id: Decimal(total) for enrollment_id, total in rows}


def attach_balances(db: Session, enrollments: Iterable[Enrollment]) -> list[Enrollment]:
    """Set `.balance` on each enrollment so the read schema can pick it up.

    An enrollment whose ledger was never opened falls back to the agreed cuota,
    mirroring `derive_payment_status`: a fee recorded only on the matrícula is
    still money owed, and showing 0 there would read as "nothing to collect".
    """
    rows = list(enrollments)
    totals = balances_for(db, [e.id for e in rows])
    for enrollment in rows:
        if enrollment.id in totals:
            enrollment.balance = totals[enrollment.id]
        else:
            enrollment.balance = enrollment.amount or Decimal("0.00")
    return rows
