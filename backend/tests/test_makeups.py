"""Los pases de recuperación: de quién son y cuándo valen.

El router comprobaba una sola cosa —que un alumno no tocara el pase de otro— y
daba por bueno todo lo demás. Cualquier profesor o administrativo, incluido el
de otra academia, podía ver los candidatos, reservar o cancelar el pase de
cualquiera con sólo acertar el número; un pase vencido seguía siendo reservable;
y el alumno que iba a recuperar no podía aparecer en ninguna lista, así que su
pase se quedaba en "reservado" para siempre.

Las pruebas van por el API, que es por donde entraba el problema.
"""

from datetime import timedelta

import pytest

from app.models import MakeUpCredit, MakeUpStatus
from tests.conftest import TODAY, auth, make_session
from tests.test_tenant_isolation import _academy  # noqa: F401  (fixture helper)


@pytest.fixture
def academies(db):
    """Dos academias completas y ajenas entre sí."""
    return {"a": _academy(db, "alfa"), "b": _academy(db, "beta")}


def _credit(db, academy, *, expires_in_days: int = 30, **kw) -> MakeUpCredit:
    defaults = {
        "tenant_id": academy["tenant"].id,
        "student_id": academy["student"].id,
        "enrollment_id": academy["enrollment"].id,
        "origin_session_id": academy["session"].id,
        "status": MakeUpStatus.available,
        "expires_at": TODAY + timedelta(days=expires_in_days),
    }
    credit = MakeUpCredit(**{**defaults, **kw})
    db.add(credit)
    db.flush()
    return credit


# ---------------- Aislamiento entre academias ----------------
def test_another_academys_admin_cannot_see_or_touch_a_credit(client, db, academies):
    """La prueba exacta del agujero: respondía 200 a las tres."""
    credit = _credit(db, academies["a"])
    db.commit()
    intruder = auth(client, "admin@beta.com")

    assert client.get(f"/makeups/{credit.id}/candidates", headers=intruder).status_code == 404
    booking = client.post(
        f"/makeups/{credit.id}/book",
        headers=intruder,
        json={"target_session_id": academies["b"]["session"].id},
    )
    assert booking.status_code == 404
    assert client.post(f"/makeups/{credit.id}/cancel-booking", headers=intruder).status_code == 404


def test_a_credit_cannot_be_created_over_another_academys_enrollment(client, db, academies):
    db.commit()
    intruder = auth(client, "admin@beta.com")

    res = client.post(
        "/makeups",
        headers=intruder,
        json={
            "student_id": academies["a"]["student"].id,
            "enrollment_id": academies["a"]["enrollment"].id,
        },
    )

    assert res.status_code == 404
    assert db.query(MakeUpCredit).count() == 0


def test_the_list_never_crosses_academies(client, db, academies):
    _credit(db, academies["a"])
    _credit(db, academies["b"])
    db.commit()

    visible = client.get("/makeups", headers=auth(client, "admin@alfa.com")).json()

    assert len(visible) == 1
    assert visible[0]["student_id"] == academies["a"]["student"].id


# ---------------- Quién puede gestionar un pase ----------------
def test_a_teacher_of_another_course_cannot_manage_the_credit(client, db, academies):
    """El pase es del profesor del curso de origen, no de cualquier profesor."""
    from app.models import User, UserRole
    from app.core.security import hash_password

    outsider = User(
        email="otro@alfa.com",
        full_name="Profe sin ese curso",
        role=UserRole.teacher,
        password_hash=hash_password("secret123"),
        tenant_id=academies["a"]["tenant"].id,
    )
    db.add(outsider)
    credit = _credit(db, academies["a"])
    db.commit()

    res = client.get(
        f"/makeups/{credit.id}/candidates", headers=auth(client, "otro@alfa.com")
    )

    assert res.status_code == 403


def test_a_student_cannot_touch_someone_elses_credit(client, db, academies):
    credit = _credit(db, academies["a"])
    db.commit()

    res = client.post(
        f"/makeups/{credit.id}/cancel-booking",
        headers=auth(client, "student@beta.com"),
    )

    assert res.status_code == 404


# ---------------- Vencimiento ----------------
def test_an_overdue_credit_expires_when_read_and_cannot_be_booked(client, db, academies):
    credit = _credit(db, academies["a"], expires_in_days=-1)
    target = make_session(
        db, academies["a"]["schedule"], TODAY + timedelta(days=7)
    )
    db.commit()
    student = auth(client, "student@alfa.com")

    listed = client.get("/makeups", headers=student).json()
    assert listed[0]["status"] == MakeUpStatus.expired.value

    res = client.post(
        f"/makeups/{credit.id}/book",
        headers=student,
        json={"target_session_id": target.id},
    )
    assert res.status_code == 400


def test_a_session_after_the_expiry_date_is_refused(client, db, academies):
    credit = _credit(db, academies["a"], expires_in_days=3)
    late = make_session(db, academies["a"]["schedule"], TODAY + timedelta(days=30))
    db.commit()

    res = client.post(
        f"/makeups/{credit.id}/book",
        headers=auth(client, "student@alfa.com"),
        json={"target_session_id": late.id},
    )

    assert res.status_code == 400
    assert "vence" in res.json()["detail"]


def test_the_cli_expires_credits_in_bulk(db, academies):
    """La caducidad no depende de que alguien abra la pantalla."""
    import argparse

    from sqlalchemy.orm import Session as SASession

    from app.cli import cmd_expire_makeups

    stale = _credit(db, academies["a"], expires_in_days=-5)
    fresh = _credit(db, academies["a"], expires_in_days=5)
    db.commit()

    exit_code = cmd_expire_makeups(
        argparse.Namespace(on=None, tenant_slug=None),
        session_factory=lambda: SASession(
            bind=db.connection(), join_transaction_mode="create_savepoint"
        ),
    )

    assert exit_code == 0
    db.refresh(stale)
    db.refresh(fresh)
    assert stale.status == MakeUpStatus.expired
    assert fresh.status == MakeUpStatus.available


# ---------------- Reserva ----------------
def test_a_withdrawn_enrollment_can_no_longer_book(client, db, academies):
    from app.models import EnrollmentStatus

    credit = _credit(db, academies["a"])
    academies["a"]["enrollment"].status = EnrollmentStatus.withdrawn
    target = make_session(db, academies["a"]["schedule"], TODAY + timedelta(days=7))
    db.commit()

    res = client.post(
        f"/makeups/{credit.id}/book",
        headers=auth(client, "student@alfa.com"),
        json={"target_session_id": target.id},
    )

    assert res.status_code == 409


def test_a_full_session_is_refused(client, db, academies):
    credit = _credit(db, academies["a"])
    target = make_session(db, academies["a"]["schedule"], TODAY + timedelta(days=7))
    academies["a"]["course"].max_students = 1  # la única plaza ya está ocupada
    db.commit()

    res = client.post(
        f"/makeups/{credit.id}/book",
        headers=auth(client, "student@alfa.com"),
        json={"target_session_id": target.id},
    )

    assert res.status_code == 409
    assert "Aforo" in res.json()["detail"]


# ---------------- El alumno visitante en la lista ----------------
def test_a_visitor_is_listed_and_can_be_marked_present(client, db, academies):
    """El circuito que nunca se cerraba: el visitante no tiene matrícula en el
    curso destino, así que no salía en ninguna lista y su pase se quedaba
    reservado para siempre."""
    target = make_session(db, academies["a"]["schedule"], TODAY + timedelta(days=7))
    credit = _credit(
        db,
        academies["a"],
        status=MakeUpStatus.booked,
        target_session_id=target.id,
    )
    db.commit()
    teacher = auth(client, "teacher@alfa.com")

    visitors = client.get(f"/sessions/{target.id}/makeup-visitors", headers=teacher)
    assert visitors.status_code == 200, visitors.text
    assert [v["credit_id"] for v in visitors.json()] == [credit.id]

    marked = client.post(
        f"/sessions/{target.id}/makeup-visitors/{credit.id}/attendance",
        headers=teacher,
        json={"present": True},
    )

    assert marked.status_code == 200, marked.text
    db.refresh(credit)
    assert credit.status == MakeUpStatus.attended


def test_a_visitor_who_never_showed_up_consumes_the_credit(client, db, academies):
    target = make_session(db, academies["a"]["schedule"], TODAY + timedelta(days=7))
    credit = _credit(
        db, academies["a"], status=MakeUpStatus.booked, target_session_id=target.id
    )
    db.commit()

    client.post(
        f"/sessions/{target.id}/makeup-visitors/{credit.id}/attendance",
        headers=auth(client, "teacher@alfa.com"),
        json={"present": False},
    )

    db.refresh(credit)
    assert credit.status == MakeUpStatus.cancelled
    assert "No se presentó" in (credit.notes or "")


def test_a_closed_register_refuses_visitor_changes(client, db, academies):
    from datetime import datetime, timezone

    target = make_session(db, academies["a"]["schedule"], TODAY + timedelta(days=7))
    target.register_closed_at = datetime.now(timezone.utc)
    credit = _credit(
        db, academies["a"], status=MakeUpStatus.booked, target_session_id=target.id
    )
    db.commit()

    res = client.post(
        f"/sessions/{target.id}/makeup-visitors/{credit.id}/attendance",
        headers=auth(client, "teacher@alfa.com"),
        json={"present": True},
    )

    assert res.status_code == 409


def test_another_academys_teacher_sees_no_visitors(client, db, academies):
    target = make_session(db, academies["a"]["schedule"], TODAY + timedelta(days=7))
    _credit(db, academies["a"], status=MakeUpStatus.booked, target_session_id=target.id)
    db.commit()

    res = client.get(
        f"/sessions/{target.id}/makeup-visitors", headers=auth(client, "teacher@beta.com")
    )

    assert res.status_code == 404
