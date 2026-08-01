"""Sessions that record whether they happened, and marks that refuse dead rows.

Three gaps closed here:

* `SessionStatus.held` existed but nothing wrote it, so reports computed
  `realizadas = total − canceladas` and a class three days away already counted
  as taught.
* Attendance and grades were accepted against cancelled sessions and against
  matrículas that had been withdrawn or certified, both of which quietly move
  the attendance rate and the final average the at-risk sweep reads.
* Rooms, holidays and teacher availability changed with no trace at all.
"""

import pytest

from app.models import ClassSession, Enrollment, EnrollmentStatus, SessionStatus
from tests.conftest import auth


@pytest.fixture
def session_a(client, world):
    """One concrete session of teacher_a's course."""
    admin = auth(client, "admin@test.com")
    generated = client.post(
        "/sessions/generate",
        headers=admin,
        json={"schedule_id": world["schedule_a"].id},
    ).json()
    assert generated, "the fixture course should generate at least one session"
    return generated[0]


def _mark(client, headers, *, enrollment_id, session_id, status="present"):
    return client.post(
        "/attendance",
        headers=headers,
        json={
            "enrollment_id": enrollment_id,
            "session_id": session_id,
            "status": status,
        },
    )


# ---------------- held ----------------
def test_taking_attendance_records_that_the_class_took_place(
    client, db, world, session_a
):
    teacher = auth(client, "teacher_a@test.com")
    assert db.get(ClassSession, session_a["id"]).status == SessionStatus.scheduled

    res = _mark(
        client,
        teacher,
        enrollment_id=world["enrollment"].id,
        session_id=session_a["id"],
    )
    assert res.status_code == 201, res.text

    db.expire_all()
    assert db.get(ClassSession, session_a["id"]).status == SessionStatus.held


def test_a_class_nobody_registered_is_not_counted_as_taught(client, world, session_a):
    """The old arithmetic reported every uncancelled session as held, including
    ones still in the future."""
    admin = auth(client, "admin@test.com")
    report = client.get("/reports?period=month", headers=admin).json()
    assert report["sessions_total"] >= 1
    assert report["sessions_held"] == 0
    assert report["sessions_pending"] == report["sessions_total"]


def test_a_registered_class_moves_from_pending_to_held(client, world, session_a):
    teacher = auth(client, "teacher_a@test.com")
    admin = auth(client, "admin@test.com")
    before = client.get("/reports?period=month", headers=admin).json()

    _mark(
        client,
        teacher,
        enrollment_id=world["enrollment"].id,
        session_id=session_a["id"],
    )

    after = client.get("/reports?period=month", headers=admin).json()
    assert after["sessions_held"] == before["sessions_held"] + 1
    assert after["sessions_pending"] == before["sessions_pending"] - 1
    assert (
        after["sessions_held"] + after["sessions_pending"] + after["sessions_cancelled"]
        == after["sessions_total"]
    )


def test_correcting_a_mark_leaves_the_session_held(client, db, world, session_a):
    teacher = auth(client, "teacher_a@test.com")
    _mark(
        client,
        teacher,
        enrollment_id=world["enrollment"].id,
        session_id=session_a["id"],
    )
    res = _mark(
        client,
        teacher,
        enrollment_id=world["enrollment"].id,
        session_id=session_a["id"],
        status="late",
    )
    assert res.status_code == 200, res.text
    db.expire_all()
    assert db.get(ClassSession, session_a["id"]).status == SessionStatus.held


def test_marking_never_revives_a_cancelled_session(client, db, world, session_a):
    """Reviving a called-off class is `PATCH /sessions/{id}` — a decision, not a
    side effect of a register being corrected."""
    admin = auth(client, "admin@test.com")
    client.post(
        f"/sessions/{session_a['id']}/cancel",
        headers=admin,
        json={"reason": "Profesor enfermo"},
    )
    db.expire_all()
    assert db.get(ClassSession, session_a["id"]).status == SessionStatus.cancelled


# ---------------- guards ----------------
def test_a_cancelled_class_cannot_be_registered(client, world, session_a):
    admin = auth(client, "admin@test.com")
    teacher = auth(client, "teacher_a@test.com")
    client.post(
        f"/sessions/{session_a['id']}/cancel", headers=admin, json={"reason": "Feriado"}
    )

    res = _mark(
        client,
        teacher,
        enrollment_id=world["enrollment"].id,
        session_id=session_a["id"],
    )
    assert res.status_code == 409, res.text


def test_a_cancelled_class_cannot_be_graded(client, world, session_a):
    admin = auth(client, "admin@test.com")
    teacher = auth(client, "teacher_a@test.com")
    client.post(
        f"/sessions/{session_a['id']}/cancel", headers=admin, json={"reason": "Feriado"}
    )

    res = client.post(
        "/grades",
        headers=teacher,
        json={
            "enrollment_id": world["enrollment"].id,
            "session_id": session_a["id"],
            "evaluation_name": "Nota del día",
            "score": 8.0,
        },
    )
    assert res.status_code == 409, res.text


@pytest.mark.parametrize("closed", ["withdrawn", "certified"])
def test_a_closed_matricula_accepts_neither_marks_nor_grades(
    client, db, world, session_a, closed
):
    teacher = auth(client, "teacher_a@test.com")
    enrollment = db.get(Enrollment, world["enrollment"].id)
    enrollment.status = EnrollmentStatus(closed)
    db.flush()

    marked = _mark(
        client,
        teacher,
        enrollment_id=enrollment.id,
        session_id=session_a["id"],
    )
    assert marked.status_code == 409, marked.text

    graded = client.post(
        "/grades",
        headers=teacher,
        json={
            "enrollment_id": enrollment.id,
            "evaluation_name": "Examen",
            "score": 9.0,
        },
    )
    assert graded.status_code == 409, graded.text


def test_a_merely_enrolled_student_can_still_be_marked(client, db, world, session_a):
    """"Inscrito" holds a seat, so the register must accept them — this is the
    other half of listing them on it."""
    teacher = auth(client, "teacher_a@test.com")
    enrollment = db.get(Enrollment, world["enrollment"].id)
    enrollment.status = EnrollmentStatus.enrolled
    db.flush()

    res = _mark(
        client,
        teacher,
        enrollment_id=enrollment.id,
        session_id=session_a["id"],
    )
    assert res.status_code == 201, res.text


# ---------------- availability ----------------
def test_an_availability_window_must_end_after_it_starts(client, world):
    """A backwards window matches nothing, so every class lands "outside" it and
    the scheduler warns forever about something nobody can satisfy."""
    admin = auth(client, "admin@test.com")
    res = client.post(
        f"/teachers/{world['teacher_a'].id}/availability",
        headers=admin,
        json={"day_of_week": 0, "start_time": "18:00:00", "end_time": "09:00:00"},
    )
    assert res.status_code == 422, res.text


def test_availability_windows_may_not_overlap(client, world):
    admin = auth(client, "admin@test.com")
    first = client.post(
        f"/teachers/{world['teacher_a'].id}/availability",
        headers=admin,
        json={"day_of_week": 0, "start_time": "09:00:00", "end_time": "13:00:00"},
    )
    assert first.status_code == 201, first.text

    overlapping = client.post(
        f"/teachers/{world['teacher_a'].id}/availability",
        headers=admin,
        json={"day_of_week": 0, "start_time": "12:00:00", "end_time": "15:00:00"},
    )
    assert overlapping.status_code == 409, overlapping.text
    assert overlapping.json()["detail"]["reason"] == "overlapping_availability"


def test_touching_windows_do_not_count_as_overlapping(client, world):
    """09:00–13:00 and 13:00–17:00 are two shifts, not a clash."""
    admin = auth(client, "admin@test.com")
    client.post(
        f"/teachers/{world['teacher_a'].id}/availability",
        headers=admin,
        json={"day_of_week": 0, "start_time": "09:00:00", "end_time": "13:00:00"},
    )
    res = client.post(
        f"/teachers/{world['teacher_a'].id}/availability",
        headers=admin,
        json={"day_of_week": 0, "start_time": "13:00:00", "end_time": "17:00:00"},
    )
    assert res.status_code == 201, res.text


def test_the_same_window_on_another_day_is_fine(client, world):
    admin = auth(client, "admin@test.com")
    for day in (0, 1):
        res = client.post(
            f"/teachers/{world['teacher_a'].id}/availability",
            headers=admin,
            json={"day_of_week": day, "start_time": "09:00:00", "end_time": "13:00:00"},
        )
        assert res.status_code == 201, f"day {day}: {res.text}"


# ---------------- the trail that was missing ----------------
def _audit(client, headers, **params):
    return client.get("/audit", headers=headers, params=params).json()["items"]


def test_creating_a_room_leaves_a_trace(client, world):
    admin = auth(client, "admin@test.com")
    room = client.post("/rooms", headers=admin, json={"name": "Aula 7"})
    assert room.status_code == 201, room.text
    rows = _audit(client, admin, entity="room", entity_id=room.json()["id"])
    assert any(r["action"] == "create" for r in rows), rows


def test_deleting_a_holiday_leaves_a_trace(client, world):
    admin = auth(client, "admin@test.com")
    holiday = client.post(
        "/holidays", headers=admin, json={"date": "2030-05-01", "name": "Día del Trabajo"}
    )
    assert holiday.status_code == 201, holiday.text
    holiday_id = holiday.json()["id"]
    assert (
        client.delete(f"/holidays/{holiday_id}", headers=admin).status_code == 204
    )
    rows = _audit(client, admin, entity="holiday", entity_id=holiday_id)
    assert {r["action"] for r in rows} == {"create", "delete"}, rows


def test_changing_a_teachers_qualifications_leaves_a_trace(client, db, world):
    """Qualifications are a hard gate on assigning a teacher to a course."""
    admin = auth(client, "admin@test.com")
    language_id = world["course_a"].level.language_id
    res = client.put(
        f"/teachers/{world['teacher_a'].id}/languages",
        headers=admin,
        json={"language_ids": [language_id]},
    )
    assert res.status_code == 200, res.text

    rows = _audit(
        client, admin, entity="teacher_languages", entity_id=world["teacher_a"].id
    )
    assert rows, "setting qualifications should be traced"
    assert rows[0]["after"]["language_ids"] == [language_id]


def test_adding_an_availability_window_leaves_a_trace(client, world):
    admin = auth(client, "admin@test.com")
    window = client.post(
        f"/teachers/{world['teacher_a'].id}/availability",
        headers=admin,
        json={"day_of_week": 2, "start_time": "08:00:00", "end_time": "12:00:00"},
    )
    assert window.status_code == 201, window.text
    rows = _audit(
        client, admin, entity="teacher_availability", entity_id=window.json()["id"]
    )
    assert any(r["action"] == "create" for r in rows), rows
