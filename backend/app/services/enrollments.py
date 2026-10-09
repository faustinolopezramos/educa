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

import math
from collections.abc import Iterable, Sequence
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.models import (
    ENROLLMENT_OCCUPIES_SEAT,
    Enrollment,
    Level,
    Payment,
    PaymentKind,
    Tenant,
    User,
)
from app.services.notifications import notify_tenant_admins


def tenant_active_students(tenant_id: int | None):
    """La consulta de los alumnos que ocupan plaza del plan en una academia.

    Un alumno cuenta una vez aunque esté en varios cursos: el plan se vende por
    alumnos, y contar matrículas hacía que quien cursa dos niveles gastara dos.
    """
    return (
        select(Enrollment.student_id)
        .join(User, Enrollment.student_id == User.id)
        .where(
            User.tenant_id == tenant_id,
            Enrollment.status.in_(ENROLLMENT_OCCUPIES_SEAT),
        )
        .distinct()
    )


def check_tenant_student_quota(
    db: Session,
    tenant_id: int,
    *,
    student_id: int | None = None,
    additional_seats: int = 1,
) -> None:
    """Refuse a new seat that would take the academy past its plan.

    `student_id` is the student about to take the seat: one who already holds a
    seat in another course costs the plan nothing more. The tenant row is locked
    so two simultaneous enrollments cannot both take the last place.
    """
    tenant = db.scalar(select(Tenant).where(Tenant.id == tenant_id).with_for_update())
    if tenant is None:
        return

    holders = tenant_active_students(tenant_id)
    if student_id is not None and db.scalar(
        holders.where(Enrollment.student_id == student_id).limit(1)
    ) is not None:
        return

    current_count = count_tenant_active_students(db, tenant_id)
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
    _warn_if_nearly_full(db, tenant, current_count + additional_seats)


# A partir de qué ocupación se avisa a la academia de que se acerca al tope.
QUOTA_WARNING_RATIO = 0.8


def count_tenant_active_students(db: Session, tenant_id: int | None) -> int:
    """Cuántos alumnos ocupan plaza del plan ahora mismo."""
    holders = tenant_active_students(tenant_id)
    return db.scalar(select(func.count()).select_from(holders.subquery())) or 0


def _warn_if_nearly_full(db: Session, tenant: Tenant, new_count: int) -> None:
    """Avisar a los admins justo cuando la academia cruza el 80 % y el 100 %.

    Sólo en el alumno que cruza cada umbral, no en todos los siguientes: un
    aviso por umbral basta, y repetirlo con cada matrícula sería ruido. Viaja en
    la transacción de la matrícula: si ésta no se guarda, el aviso tampoco.
    """
    limit = tenant.max_active_students
    warning_at = max(1, math.ceil(limit * QUOTA_WARNING_RATIO))
    if new_count not in (warning_at, limit):
        return
    if new_count >= limit:
        title = "Tu academia llegó al límite de su plan"
        body = (
            f"Tienes {new_count} de {limit} alumnos activos. Para matricular a más, "
            "solicita un plan mayor desde Inicio → Tu plan."
        )
    else:
        title = "Tu academia se acerca al límite de su plan"
        body = (
            f"Tienes {new_count} de {limit} alumnos activos. Cuando llegues a {limit} "
            "no podrás matricular a nadie más; puedes solicitar un plan mayor desde "
            "Inicio → Tu plan."
        )
    notify_tenant_admins(db, tenant.id, "plan_quota", title, body)



def level_after(db: Session, level: Level) -> Level | None:
    """The level that follows `level` in its language or track, if any.

    Levels are ordered by creation (`id`), which is how the catalogue builds a
    track: A1 before A2, "Módulo 2" before "Módulo 10". Ordering by `code`
    would put M10 straight after M1.
    """
    return db.scalar(
        select(Level)
        .where(Level.language_id == level.language_id, Level.id > level.id)
        .order_by(Level.id)
        .limit(1)
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
