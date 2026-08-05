"""El cierre explícito de la lista, y qué cuenta como asistencia.

Dos reglas que antes no tenían una sola respuesta:

* Una sesión está **registrada** cuando su profesor cierra la lista, no cuando
  alguien marca al primer alumno. Antes bastaba un marcaje, de modo que 3 de 30
  figuraba en el reporte igual que 30 de 30.
* La falta **justificada** no cuenta ni a favor ni en contra: sale del cálculo.
  Antes el reporte la penalizaba como una ausencia, el kardex la premiaba como
  una asistencia y el panel del alumno la penalizaba otra vez — tres tasas
  distintas para la misma persona.
"""

from datetime import date, timedelta

import pytest

from app.models import (
    ATTENDANCE_COUNTS_TOWARD_RATE,
    ATTENDANCE_IS_PRESENT,
    AttendanceStatus,
    ClassSession,
    Enrollment,
    attendance_rate,
)
from app.services.sequences import next_enrollment_code
from tests.conftest import TODAY, auth


@pytest.fixture
def session_a(client, db, world):
    """Una sesión de hoy en el curso del profesor A."""
    session = ClassSession(schedule_id=world["schedule_a"].id, date=TODAY)
    db.add(session)
    db.flush()
    return session


def _mark(client, headers, enrollment_id, session_id, status="present"):
    return client.post(
        "/attendance",
        headers=headers,
        json={
            "enrollment_id": enrollment_id,
            "session_id": session_id,
            "status": status,
        },
    )


# ---------------------------------------------------------------------------
# Qué significa "asistió" — una sola respuesta
# ---------------------------------------------------------------------------
def test_late_counts_as_having_come_to_class():
    assert AttendanceStatus.late in ATTENDANCE_IS_PRESENT


def test_an_excused_absence_is_out_of_the_calculation_entirely():
    """Ni numerador ni denominador: no es una asistencia que no tuvo, pero
    tampoco una falta que deba pesarle."""
    assert AttendanceStatus.excused not in ATTENDANCE_IS_PRESENT
    assert AttendanceStatus.excused not in ATTENDANCE_COUNTS_TOWARD_RATE


@pytest.mark.parametrize(
    "marks, expected",
    [
        ([AttendanceStatus.present] * 3, 1.0),
        ([AttendanceStatus.present, AttendanceStatus.absent], 0.5),
        ([AttendanceStatus.present, AttendanceStatus.late], 1.0),
        # De diez clases con una justificada, la tasa se calcula sobre nueve.
        ([AttendanceStatus.present] * 9 + [AttendanceStatus.excused], 1.0),
        ([AttendanceStatus.absent, AttendanceStatus.excused], 0.0),
        # Sólo justificadas: no hay nada que promediar, y cero sería mentira.
        ([AttendanceStatus.excused, AttendanceStatus.excused], None),
        ([], None),
    ],
)
def test_the_rate_is_computed_the_same_way_everywhere(marks, expected):
    assert attendance_rate(marks) == expected


def test_an_excused_absence_does_not_lower_the_reported_rate(
    client, db, world, session_a
):
    teacher = auth(client, "teacher_a@test.com")
    admin = auth(client, "admin@test.com")

    _mark(
        client,
        teacher,
        enrollment_id=world["enrollment"].id,
        session_id=session_a.id,
        status="excused",
    )

    report = client.get("/reports?period=month", headers=admin).json()
    # La única marca del periodo es una justificada: no hay tasa que dar, en
    # lugar de un 0% que castigaría a quien presentó constancia.
    assert report["attendance_rate"] is None


# ---------------------------------------------------------------------------
# El cierre de la lista
# ---------------------------------------------------------------------------
def test_the_register_starts_open(client, world, session_a):
    teacher = auth(client, "teacher_a@test.com")
    body = client.get(f"/sessions/{session_a.id}", headers=teacher).json()
    assert body["register_closed_at"] is None


def test_closing_needs_everybody_marked(client, db, world, session_a):
    """Dos alumnos con plaza y uno marcado: la lista no está lista."""
    db.add(
        Enrollment(
            student_id=world["outsider"].id,
            course_id=world["course_a"].id,
            enrollment_code=next_enrollment_code(db, year=TODAY.year),
        )
    )
    db.flush()

    teacher = auth(client, "teacher_a@test.com")
    _mark(
        client,
        teacher,
        enrollment_id=world["enrollment"].id,
        session_id=session_a.id,
    )

    res = client.post(f"/sessions/{session_a.id}/close-register", headers=teacher)
    assert res.status_code == 409, res.text
    detail = res.json()["detail"]
    assert detail["reason"] == "incomplete_register"
    # La cifra viaja en el error para que la interfaz diga cuántos faltan.
    assert detail["marked"] == 1
    assert detail["total"] == 2


def test_force_closes_a_register_that_will_never_be_complete(client, db, world, session_a):
    """El caso real: alguien que no apareció y a quien el profesor no marca."""
    db.add(
        Enrollment(
            student_id=world["outsider"].id,
            course_id=world["course_a"].id,
            enrollment_code=next_enrollment_code(db, year=TODAY.year),
        )
    )
    db.flush()
    teacher = auth(client, "teacher_a@test.com")
    _mark(
        client,
        teacher,
        enrollment_id=world["enrollment"].id,
        session_id=session_a.id,
    )

    res = client.post(
        f"/sessions/{session_a.id}/close-register?force=true", headers=teacher
    )
    assert res.status_code == 200, res.text
    assert res.json()["register_closed_at"] is not None


def test_closing_also_says_the_class_took_place(client, world, session_a):
    teacher = auth(client, "teacher_a@test.com")
    _mark(
        client,
        teacher,
        enrollment_id=world["enrollment"].id,
        session_id=session_a.id,
    )
    body = client.post(
        f"/sessions/{session_a.id}/close-register", headers=teacher
    ).json()
    assert body["status"] == "held"


def test_a_cancelled_class_has_no_register_to_close(client, world, session_a):
    teacher = auth(client, "teacher_a@test.com")
    client.post(f"/sessions/{session_a.id}/cancel", headers=teacher, json={})
    res = client.post(f"/sessions/{session_a.id}/close-register", headers=teacher)
    assert res.status_code == 409, res.text


def test_only_the_titular_closes_the_register(client, db, world, session_a):
    """Misma regla que generar, cancelar y reprogramar la franja."""
    from app.models import CourseTeacher

    db.add(
        CourseTeacher(
            course_id=world["course_a"].id,
            teacher_id=world["teacher_b"].id,
            is_lead=False,
        )
    )
    db.flush()

    other = auth(client, "teacher_b@test.com")
    res = client.post(f"/sessions/{session_a.id}/close-register", headers=other)
    assert res.status_code == 403, res.text
    assert "titular" in res.json()["detail"]


def test_a_closed_register_can_be_reopened_to_fix_it(client, world, session_a):
    teacher = auth(client, "teacher_a@test.com")
    _mark(
        client,
        teacher,
        enrollment_id=world["enrollment"].id,
        session_id=session_a.id,
    )
    client.post(f"/sessions/{session_a.id}/close-register", headers=teacher)

    reopened = client.post(
        f"/sessions/{session_a.id}/reopen-register", headers=teacher
    )
    assert reopened.status_code == 200, reopened.text
    assert reopened.json()["register_closed_at"] is None
    # La clase siguió ocurriendo: lo que se reabre es el registro, no el hecho.
    assert reopened.json()["status"] == "held"


def test_reopening_an_open_register_is_refused(client, world, session_a):
    teacher = auth(client, "teacher_a@test.com")
    res = client.post(f"/sessions/{session_a.id}/reopen-register", headers=teacher)
    assert res.status_code == 409, res.text


def test_closing_and_reopening_leave_a_trail(client, world, session_a):
    """Cerrar es un gesto humano y equivocarse en él también; que quede escrito."""
    teacher = auth(client, "teacher_a@test.com")
    admin = auth(client, "admin@test.com")
    _mark(
        client,
        teacher,
        enrollment_id=world["enrollment"].id,
        session_id=session_a.id,
    )
    client.post(f"/sessions/{session_a.id}/close-register", headers=teacher)
    client.post(f"/sessions/{session_a.id}/reopen-register", headers=teacher)

    trail = client.get(
        "/audit",
        params={"entity": "class_session", "entity_id": session_a.id},
        headers=admin,
    ).json()
    actions = [row["action"] for row in trail["items"]]
    assert "close_register" in actions
    assert "reopen_register" in actions


def test_the_teachers_pending_tray_counts_open_registers_not_unmarked_ones(
    client, db, world
):
    """Una clase pasada con la lista a medias sigue siendo un pendiente.

    Antes el contador preguntaba por `status = scheduled`, que el primer marcaje
    ya borraba: la clase desaparecía de los pendientes con la lista sin terminar.
    """
    past = ClassSession(
        schedule_id=world["schedule_a"].id, date=TODAY - timedelta(days=7)
    )
    db.add(past)
    db.flush()

    teacher = auth(client, "teacher_a@test.com")
    before = client.get("/dashboard", headers=teacher).json()
    pending_before = next(
        (i["count"] for i in before["items"] if i["kind"] == "unregistered_sessions"),
        0,
    )
    assert pending_before >= 1

    _mark(client, teacher, enrollment_id=world["enrollment"].id, session_id=past.id)
    mid = client.get("/dashboard", headers=teacher).json()
    pending_mid = next(
        (i["count"] for i in mid["items"] if i["kind"] == "unregistered_sessions"), 0
    )
    assert pending_mid == pending_before, "un marcaje suelto no cierra la lista"

    client.post(f"/sessions/{past.id}/close-register", headers=teacher)
    after = client.get("/dashboard", headers=teacher).json()
    pending_after = next(
        (i["count"] for i in after["items"] if i["kind"] == "unregistered_sessions"), 0
    )
    assert pending_after == pending_before - 1
