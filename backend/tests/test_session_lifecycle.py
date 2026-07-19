"""Festivos, cancelación y reprogramación de sesiones."""

from datetime import date, timedelta

from app.models import Schedule
from tests.conftest import auth


def _term_monday(world) -> date:
    """The first Monday on/after course_a's term start (schedule_a is Monday)."""
    start = world["course_a"].start_date
    return start + timedelta(days=(0 - start.weekday()) % 7)


# ---------------- Holidays ----------------
def test_generation_skips_a_holiday(client, world, db):
    admin = auth(client, "admin@test.com")
    monday = _term_monday(world)
    client.post("/holidays", headers=admin, json={"date": monday.isoformat(), "name": "Feriado"})

    sessions = client.post(
        "/sessions/generate", headers=admin, json={"schedule_id": world["schedule_a"].id}
    ).json()
    dates = {s["date"] for s in sessions}
    assert monday.isoformat() not in dates, "no session on a holiday"


def test_a_duplicate_holiday_date_is_rejected(client, world):
    admin = auth(client, "admin@test.com")
    body = {"date": "2026-12-25", "name": "Navidad"}
    assert client.post("/holidays", headers=admin, json=body).status_code == 201
    assert client.post("/holidays", headers=admin, json=body).status_code == 409


def test_holidays_are_readable_but_only_admin_writes(client, world):
    teacher = auth(client, "teacher_a@test.com")
    assert client.get("/holidays", headers=teacher).status_code == 200
    assert (
        client.post("/holidays", headers=teacher, json={"date": "2026-12-25", "name": "x"}).status_code
        == 403
    )


# ---------------- Cancel ----------------
def test_cancelling_a_session_marks_it_and_keeps_the_row(client, world):
    admin = auth(client, "admin@test.com")
    session = client.post(
        "/sessions/generate", headers=admin, json={"schedule_id": world["schedule_a"].id}
    ).json()[0]
    res = client.post(
        f"/sessions/{session['id']}/cancel", headers=admin, json={"reason": "Profesor enfermo"}
    )
    assert res.status_code == 200
    assert res.json()["status"] == "cancelled"
    assert res.json()["cancel_reason"] == "Profesor enfermo"


def test_a_cancelled_session_does_not_count_as_held_in_the_report(client, world):
    admin = auth(client, "admin@test.com")
    sessions = client.post(
        "/sessions/generate", headers=admin, json={"schedule_id": world["schedule_a"].id}
    ).json()
    client.post(f"/sessions/{sessions[0]['id']}/cancel", headers=admin, json={"reason": "x"})

    body = client.get(
        "/reports", headers=admin, params={"period": "month", "anchor": sessions[0]["date"]}
    ).json()
    assert body["sessions_cancelled"] >= 1
    assert body["sessions_held"] == body["sessions_total"] - body["sessions_cancelled"]


# ---------------- Reschedule ----------------
def test_rescheduling_cancels_the_original_and_creates_a_makeup(client, world):
    admin = auth(client, "admin@test.com")
    session = client.post(
        "/sessions/generate", headers=admin, json={"schedule_id": world["schedule_a"].id}
    ).json()[0]
    # Move it to a Wednesday (a make-up can fall on any weekday).
    new_date = (date.fromisoformat(session["date"]) + timedelta(days=2)).isoformat()

    res = client.post(
        f"/sessions/{session['id']}/reschedule", headers=admin, json={"new_date": new_date}
    )
    assert res.status_code == 200, res.text
    makeup = res.json()
    assert makeup["date"] == new_date
    assert makeup["origin_session_id"] == session["id"]

    # The original is now cancelled.
    all_sessions = client.get(
        f"/sessions?schedule_id={world['schedule_a'].id}", headers=admin
    ).json()
    original = next(s for s in all_sessions if s["id"] == session["id"])
    assert original["status"] == "cancelled"


def test_reschedule_onto_a_holiday_is_rejected(client, world):
    admin = auth(client, "admin@test.com")
    session = client.post(
        "/sessions/generate", headers=admin, json={"schedule_id": world["schedule_a"].id}
    ).json()[0]
    new_date = (date.fromisoformat(session["date"]) + timedelta(days=2)).isoformat()
    client.post("/holidays", headers=admin, json={"date": new_date, "name": "Feriado"})

    res = client.post(
        f"/sessions/{session['id']}/reschedule", headers=admin, json={"new_date": new_date}
    )
    assert res.status_code == 409


def test_a_teacher_cannot_cancel_a_session_of_another_schedule(client, world):
    admin = auth(client, "admin@test.com")
    session = client.post(
        "/sessions/generate", headers=admin, json={"schedule_id": world["schedule_a"].id}
    ).json()[0]
    tb = auth(client, "teacher_b@test.com")
    res = client.post(f"/sessions/{session['id']}/cancel", headers=tb, json={"reason": "x"})
    assert res.status_code == 404
