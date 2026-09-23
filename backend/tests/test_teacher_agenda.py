"""La jornada y el tablero de la clase.

Las dos pantallas del profesor pedían su contenido a trozos: la agenda cruzaba
sesiones, horarios, cursos, aulas y asistencia desde el navegador, con una
consulta de conteo por clase, y la lista del día repetía el ejercicio por
alumno. Estos dos endpoints responden cada pregunta entera, y —lo que importa
aquí— con el mismo alcance por academia y por rol que el resto del sistema.
"""

from datetime import timedelta

import pytest

from app.models import (
    Attendance,
    AttendanceStatus,
    MakeUpCredit,
    MakeUpStatus,
    SessionStatus,
)
from tests.conftest import TODAY, auth, make_session
from tests.test_tenant_isolation import _academy  # noqa: F401


@pytest.fixture
def academies(db):
    return {"a": _academy(db, "alfa"), "b": _academy(db, "beta")}


def test_the_agenda_answers_the_whole_question_for_today(client, db, academies):
    """Curso, hora, aula, modalidad y cuánto falta por marcar, en una llamada."""
    a = academies["a"]
    session = make_session(db, a["schedule"], TODAY)
    db.add(
        Attendance(
            enrollment_id=a["enrollment"].id,
            session_id=session.id,
            status=AttendanceStatus.present,
        )
    )
    db.commit()

    res = client.get("/sessions/agenda", headers=auth(client, "teacher@alfa.com"))

    assert res.status_code == 200, res.text
    entries = [e for e in res.json() if e["session_id"] == session.id]
    assert len(entries) == 1
    entry = entries[0]
    assert entry["course_name"] == a["course"].name
    assert entry["teacher_name"] == a["teacher"].full_name
    assert entry["start_time"].startswith("09:00")
    assert entry["students_total"] == 1
    assert entry["students_marked"] == 1
    assert entry["register_closed"] is False


def test_the_agenda_never_crosses_academies(client, db, academies):
    make_session(db, academies["b"]["schedule"], TODAY)
    db.commit()

    visible = client.get(
        "/sessions/agenda", headers=auth(client, "teacher@alfa.com")
    ).json()

    assert visible == []


def test_the_agenda_covers_the_range_asked_for(client, db, academies):
    a = academies["a"]
    next_week = make_session(db, a["schedule"], TODAY + timedelta(days=7))
    db.commit()
    teacher = auth(client, "teacher@alfa.com")

    # Sin fechas, la agenda es la de hoy: la clase de la semana que viene no sale.
    today_ids = [e["session_id"] for e in client.get("/sessions/agenda", headers=teacher).json()]
    assert next_week.id not in today_ids

    week = client.get(
        "/sessions/agenda"
        f"?date_from={TODAY.isoformat()}&date_to={(TODAY + timedelta(days=10)).isoformat()}",
        headers=teacher,
    ).json()
    assert next_week.id in [e["session_id"] for e in week]
    # Y llegan en orden de calendario, que es como se dibuja la jornada.
    assert [e["date"] for e in week] == sorted(e["date"] for e in week)


def test_the_board_carries_the_roster_with_the_marks_already_made(client, db, academies):
    a = academies["a"]
    session = make_session(db, a["schedule"], TODAY)
    db.add(
        Attendance(
            enrollment_id=a["enrollment"].id,
            session_id=session.id,
            status=AttendanceStatus.late,
        )
    )
    db.commit()

    board = client.get(
        f"/sessions/{session.id}/board", headers=auth(client, "teacher@alfa.com")
    )

    assert board.status_code == 200, board.text
    body = board.json()
    assert body["session"]["course_name"] == a["course"].name
    assert [s["full_name"] for s in body["students"]] == [a["student"].full_name]
    assert body["students"][0]["mark"] == AttendanceStatus.late.value
    assert body["students"][0]["enrollment_code"] == a["enrollment"].enrollment_code


def test_the_board_lists_the_students_coming_to_make_up(client, db, academies):
    a = academies["a"]
    session = make_session(db, a["schedule"], TODAY)
    db.add(
        MakeUpCredit(
            tenant_id=a["tenant"].id,
            student_id=a["student"].id,
            enrollment_id=a["enrollment"].id,
            target_session_id=session.id,
            status=MakeUpStatus.booked,
            expires_at=TODAY + timedelta(days=30),
        )
    )
    db.commit()

    body = client.get(
        f"/sessions/{session.id}/board", headers=auth(client, "teacher@alfa.com")
    ).json()

    assert body["session"]["makeup_visitors"] == 1
    assert [v["full_name"] for v in body["visitors"]] == [a["student"].full_name]
    assert body["visitors"][0]["origin_course_name"] == a["course"].name


def test_another_academys_teacher_gets_no_board(client, db, academies):
    session = make_session(db, academies["a"]["schedule"], TODAY)
    db.commit()

    res = client.get(
        f"/sessions/{session.id}/board", headers=auth(client, "teacher@beta.com")
    )

    assert res.status_code == 404


def test_a_student_cannot_open_the_board(client, db, academies):
    session = make_session(db, academies["a"]["schedule"], TODAY)
    db.commit()

    res = client.get(
        f"/sessions/{session.id}/board", headers=auth(client, "student@alfa.com")
    )

    assert res.status_code == 403


def test_a_closed_register_says_so(client, db, academies):
    a = academies["a"]
    session = make_session(db, a["schedule"], TODAY)
    session.status = SessionStatus.held
    db.commit()
    teacher = auth(client, "teacher@alfa.com")
    client.post(
        "/attendance",
        headers=teacher,
        json={
            "enrollment_id": a["enrollment"].id,
            "session_id": session.id,
            "status": "present",
        },
    )
    client.post(f"/sessions/{session.id}/close-register", headers=teacher)

    entry = client.get("/sessions/agenda", headers=teacher).json()[0]

    assert entry["register_closed"] is True
    assert entry["students_marked"] == entry["students_total"] == 1


def test_the_agenda_says_who_may_close_the_register(client, db, academies):
    """Marcar asistencia lo hace quien imparte el curso; cerrar la lista, el
    titular de la franja. La pantalla necesita la respuesta para no ofrecer un
    botón que la API rechazaría."""
    from app.core.security import hash_password
    from app.models import CourseTeacher, User, UserRole

    a = academies["a"]
    make_session(db, a["schedule"], TODAY)
    suplente = User(
        email="suplente@alfa.com",
        full_name="Profesor suplente",
        role=UserRole.teacher,
        password_hash=hash_password("secret123"),
        tenant_id=a["tenant"].id,
    )
    db.add(suplente)
    db.flush()
    db.add(CourseTeacher(course_id=a["course"].id, teacher_id=suplente.id))
    db.commit()

    titular = client.get(
        "/sessions/agenda", headers=auth(client, "teacher@alfa.com")
    ).json()[0]
    assert titular["can_close_register"] is True

    otro = client.get(
        "/sessions/agenda", headers=auth(client, "suplente@alfa.com")
    ).json()[0]
    assert otro["can_close_register"] is False
