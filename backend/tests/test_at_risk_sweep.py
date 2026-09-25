"""The weekly at-risk sweep, and the consecutive-absences signal it relies on."""

from datetime import date, datetime, time, timedelta

import pytest
from sqlalchemy import select

from app.core.clock import academy_tz
from app.core.config import settings
from app.models import AtRiskSweep, CourseStatus, Notification
from app.services.risk_sweep import run_due_sweeps, sweep_due_at
from tests.conftest import auth


@pytest.fixture
def sessions(client, world, db):
    world["course_a"].status = CourseStatus.in_progress
    world["course_b"].status = CourseStatus.in_progress
    db.flush()
    admin = auth(client, "admin@test.com")
    return client.post(
        "/sessions/generate", headers=admin, json={"schedule_id": world["schedule_a"].id}
    ).json()


def _mark(client, world, session, status):
    teacher = auth(client, "teacher_a@test.com")
    res = client.post(
        "/attendance",
        headers=teacher,
        json={"enrollment_id": world["enrollment"].id, "session_id": session["id"], "status": status},
    )
    assert res.status_code in (200, 201), res.text


def _after(session) -> datetime:
    """Midday the day after a session, in the academy's zone."""
    day = date.fromisoformat(session["date"]) + timedelta(days=1)
    return datetime.combine(day, time(12), tzinfo=academy_tz())


def _notes(db, user, kind):
    return list(
        db.scalars(
            select(Notification).where(
                Notification.recipient_id == user.id, Notification.kind == kind
            )
        ).all()
    )


# ---------------- The consecutive-absences signal ----------------
def _reasons(db, world, anchor):
    """Motivos de riesgo en la ventana de cuatro semanas que acaba en `anchor`:
    las clases del mundo de pruebas son semanales, así que un mes natural
    puede no cubrir más que una."""
    from app.services.reports import build_report

    report = build_report(db, world["admin"], "last4w", date.fromisoformat(anchor))
    return [r.reasons for r in report.at_risk]


def test_trailing_absences_are_flagged(client, db, world, sessions):
    for s, st in zip(sessions[:4], ["present", "present", "present", "absent"]):
        _mark(client, world, s, st)
    # 3 de 4: la tasa (0.75) no salta, y una sola falta no es racha.
    assert _reasons(db, world, sessions[3]["date"]) == []

    _mark(client, world, sessions[4], "absent")
    [reasons] = _reasons(db, world, sessions[4]["date"])
    assert "2 faltas seguidas" in reasons


def test_a_streak_broken_by_attending_is_not_flagged(client, db, world, sessions):
    for s, st in zip(sessions[:4], ["absent", "absent", "present", "present"]):
        _mark(client, world, s, st)
    # 2 de 4 (0.5) sí baja la tasa, pero la racha se cortó al volver.
    [reasons] = _reasons(db, world, sessions[3]["date"])
    assert not any("seguidas" in r for r in reasons)


# ---------------- The sweep ----------------
def test_sweep_tells_teachers_and_directors_once_a_week(client, db, world, sessions):
    for s in sessions[:3]:
        _mark(client, world, s, "absent")
    now = _after(sessions[2])

    assert run_due_sweeps(db, now=now, force=True) == 1
    [teacher_note] = _notes(db, world["teacher_a"], "at_risk")
    assert world["student"].full_name in teacher_note.body
    assert _notes(db, world["teacher_b"], "at_risk") == []  # no es su curso
    [director_note] = _notes(db, world["admin"], "at_risk_management")
    assert f"• {world['student'].full_name} — {world['course_a'].name}" in director_note.body

    sweep = db.scalar(select(AtRiskSweep))
    assert sweep.students_flagged == 1 and sweep.notifications_sent == 2

    # La misma semana no se repite, ni forzándolo.
    assert run_due_sweeps(db, now=now + timedelta(hours=3), force=True) == 0
    assert len(_notes(db, world["teacher_a"], "at_risk")) == 1


def test_sweep_waits_for_its_day_and_hour(db, world, sessions):
    due = sweep_due_at(date.fromisoformat(sessions[0]["date"]))
    assert run_due_sweeps(db, now=due - timedelta(minutes=1)) == 0
    assert db.scalar(select(AtRiskSweep)) is None
    assert run_due_sweeps(db, now=due + timedelta(minutes=1)) == 1


def test_a_quiet_week_is_recorded_without_alerts(db, world, sessions):
    assert run_due_sweeps(db, now=_after(sessions[0]), force=True) == 1
    assert _notes(db, world["admin"], "at_risk_management") == []
    assert db.scalar(select(AtRiskSweep)).students_flagged == 0


def test_sweep_can_be_turned_off(db, world, sessions, monkeypatch):
    monkeypatch.setattr(settings, "at_risk_sweep_enabled", False)
    assert run_due_sweeps(db, now=_after(sessions[0]) + timedelta(days=7)) == 0


def test_courses_not_running_are_not_swept(client, db, world, sessions):
    for s in sessions[:3]:
        _mark(client, world, s, "absent")
    world["course_a"].status = CourseStatus.closed
    world["course_b"].status = CourseStatus.closed
    db.flush()
    assert run_due_sweeps(db, now=_after(sessions[2]), force=True) == 0
    assert _notes(db, world["teacher_a"], "at_risk") == []
