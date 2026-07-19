"""Class sessions: materializing a weekly schedule into dated occurrences."""

from datetime import date

from app.models import ClassSession, Schedule
from app.services.sessions import ensure_session, generate_sessions, term_dates
from tests.conftest import auth


# ---------------- Pure generation logic ----------------
def test_term_dates_lands_on_the_right_weekday(db, world):
    schedule = world["schedule_a"]  # Monday (day_of_week=0)
    dates = term_dates(schedule)
    assert dates, "a bounded term should yield sessions"
    assert all(d.weekday() == 0 for d in dates)
    assert dates == sorted(dates)


def test_generation_is_idempotent(db, world):
    schedule = world["schedule_a"]
    first = generate_sessions(db, schedule)
    assert first, "first run creates sessions"
    second = generate_sessions(db, schedule)
    assert second == [], "second run creates nothing"
    total = db.scalars(
        __import__("sqlalchemy").select(ClassSession.id).where(
            ClassSession.schedule_id == schedule.id
        )
    ).all()
    assert len(total) == len(first)


def test_an_open_term_yields_no_bulk_sessions(db, world):
    schedule = world["schedule_a"]
    schedule.term_start = None
    schedule.term_end = None
    db.flush()
    assert generate_sessions(db, schedule) == []


def test_ensure_rejects_a_date_off_the_class_weekday(db, world):
    schedule = world["schedule_a"]  # Monday
    tuesday = date(2026, 7, 14)  # a Tuesday
    assert tuesday.weekday() == 1
    try:
        ensure_session(db, schedule, tuesday)
    except ValueError:
        pass
    else:
        raise AssertionError("a Tuesday is not a session of a Monday class")


# ---------------- API ----------------
def test_generate_endpoint_creates_the_term(client, world):
    headers = auth(client, "admin@test.com")
    res = client.post(
        "/sessions/generate", headers=headers, json={"schedule_id": world["schedule_a"].id}
    )
    assert res.status_code == 200, res.text
    assert len(res.json()) > 0


def test_ensure_endpoint_is_get_or_create(client, world, db):
    headers = auth(client, "teacher_a@test.com")
    # schedule_a is Monday; pick a Monday.
    monday = _next_weekday(world["schedule_a"].term_start, 0)
    body = {"schedule_id": world["schedule_a"].id, "date": monday.isoformat()}
    first = client.post("/sessions/ensure", headers=headers, json=body)
    assert first.status_code == 200, first.text
    second = client.post("/sessions/ensure", headers=headers, json=body)
    assert second.json()["id"] == first.json()["id"], "same session, not a duplicate"


def test_a_teacher_cannot_generate_for_a_schedule_they_do_not_teach(client, world):
    headers = auth(client, "teacher_b@test.com")
    res = client.post(
        "/sessions/generate", headers=headers, json={"schedule_id": world["schedule_a"].id}
    )
    assert res.status_code == 404, "not-owned schedule is a 404, not a 403"


def test_a_student_only_sees_sessions_of_their_courses(client, world):
    admin = auth(client, "admin@test.com")
    client.post(
        "/sessions/generate", headers=admin, json={"schedule_id": world["schedule_a"].id}
    )
    client.post(
        "/sessions/generate", headers=admin, json={"schedule_id": world["schedule_b"].id}
    )
    student = auth(client, "student@test.com")  # enrolled in course_a only
    body = client.get("/sessions", headers=student).json()
    schedule_ids = {s["schedule_id"] for s in body}
    assert schedule_ids == {world["schedule_a"].id}


def _next_weekday(start, weekday: int):
    from datetime import timedelta

    offset = (weekday - start.weekday()) % 7
    return start + timedelta(days=offset)
