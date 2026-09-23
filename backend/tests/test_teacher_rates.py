"""La tarifa con la que se paga una clase es la que regía el día que se dio.

La nómina leía `users.hourly_rate`, el valor de hoy, para liquidar cualquier
fecha: subirle la tarifa a un profesor reescribía hacia atrás meses ya cerrados
y pagados por otro importe. Ahora cada tarifa tiene fecha de entrada en vigor.

También se fija aquí que los importes son exactos: con `float`, tres clases de
33.33 sumaban 99.99000000000001.
"""

from datetime import timedelta
from decimal import Decimal

from app.models import SessionStatus, TeacherRate
from app.services.teacher_payroll import calculate_teacher_payroll
from tests.conftest import TODAY, auth, make_session


def _rate(db, teacher, amount: str, days_ago: int) -> TeacherRate:
    row = TeacherRate(
        tenant_id=teacher.tenant_id,
        teacher_id=teacher.id,
        hourly_rate=Decimal(amount),
        effective_from=TODAY - timedelta(days=days_ago),
    )
    db.add(row)
    db.flush()
    return row


def test_a_raise_does_not_rewrite_what_was_already_settled(db, world):
    """Dos clases iguales, una antes y otra después de la subida: cada una se
    paga a lo que valía la hora ese día."""
    teacher = world["teacher_a"]
    teacher.hourly_rate = Decimal("80.00")
    _rate(db, teacher, "50.00", days_ago=60)
    _rate(db, teacher, "80.00", days_ago=10)

    # Dos clases de una hora, idénticas salvo la fecha. Se marcan impartidas,
    # que es lo que la nómina liquida.
    old = make_session(db, world["schedule_a"], TODAY - timedelta(days=30))
    recent = make_session(db, world["schedule_a"], TODAY - timedelta(days=5))
    old.status = SessionStatus.held
    recent.status = SessionStatus.held
    db.flush()

    report = calculate_teacher_payroll(db, teacher, TODAY - timedelta(days=90), TODAY)

    rates = {item.date: item.hourly_rate for item in report.sessions}
    assert rates[old.date] == Decimal("50.00")
    assert rates[recent.date] == Decimal("80.00")
    # Una hora a 50 y otra a 80: la subida no toca lo ya liquidado.
    assert report.total_amount == Decimal("130.00")


def test_the_rate_of_the_day_is_the_one_in_force(db, world):
    from app.services.teacher_payroll import rate_on

    history = [
        (TODAY - timedelta(days=60), Decimal("50.00")),
        (TODAY - timedelta(days=10), Decimal("80.00")),
    ]
    fallback = Decimal("99.00")

    assert rate_on(history, TODAY - timedelta(days=30), fallback) == Decimal("50.00")
    assert rate_on(history, TODAY, fallback) == Decimal("80.00")
    # Una clase anterior a cualquier tarifa registrada cae en la de la ficha.
    assert rate_on(history, TODAY - timedelta(days=90), fallback) == fallback
    assert rate_on([], TODAY, fallback) == fallback


def test_setting_a_rate_records_it_with_its_start_date(client, db, world):
    teacher = world["teacher_a"]
    db.commit()
    admin = auth(client, "admin@test.com")

    res = client.patch(
        f"/teachers/{teacher.id}/rate",
        headers=admin,
        json={"hourly_rate": 75.5, "effective_from": TODAY.isoformat()},
    )

    assert res.status_code == 200, res.text
    rows = db.query(TeacherRate).filter(TeacherRate.teacher_id == teacher.id).all()
    assert [(r.hourly_rate, r.effective_from) for r in rows] == [
        (Decimal("75.50"), TODAY)
    ]
    db.refresh(teacher)
    assert teacher.hourly_rate == Decimal("75.50")


def test_a_future_rate_does_not_change_todays(client, db, world):
    teacher = world["teacher_a"]
    teacher.hourly_rate = Decimal("50.00")
    db.commit()
    admin = auth(client, "admin@test.com")

    client.patch(
        f"/teachers/{teacher.id}/rate",
        headers=admin,
        json={
            "hourly_rate": 90,
            "effective_from": (TODAY + timedelta(days=30)).isoformat(),
        },
    )

    db.refresh(teacher)
    # La subida está programada, pero hoy todavía se cobra lo de antes.
    assert teacher.hourly_rate == Decimal("50.00")
    future = db.query(TeacherRate).filter(TeacherRate.teacher_id == teacher.id).one()
    assert future.hourly_rate == Decimal("90.00")


def test_money_adds_up_to_the_cent(client, db, world):
    """Tres cuotas de 33.33 suman 99.99 exactos, no 99.99000000000001."""
    from app.models import Payment, PaymentKind

    for _ in range(3):
        db.add(
            Payment(
                enrollment_id=world["enrollment"].id,
                kind=PaymentKind.payment,
                amount=Decimal("33.33"),
                recorded_by=world["admin"].id,
            )
        )
    db.commit()

    ledger = client.get(
        f"/enrollments/{world['enrollment'].id}/ledger",
        headers=auth(client, "admin@test.com"),
    ).json()

    assert ledger["paid"] == 99.99
