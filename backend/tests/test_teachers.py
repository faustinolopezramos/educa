"""The /teachers router.

This file exists because the router had no tests at all, and so a
`GET /teachers` that could only ever raise `NameError` shipped and passed CI.
The student dashboard calls it on every load (`usePublicTeachers`), which made a
500 on a main path invisible to the suite.
"""

from datetime import time

from sqlalchemy import select

from app.models import Language, TeacherAvailability, TeacherLanguage
from tests.conftest import auth


# ---------------- The directory endpoint ----------------
def test_listing_teachers_returns_them(client, world):
    """The regression guard: this answered 500, not 200."""
    headers = auth(client, "student@test.com")
    res = client.get("/teachers", headers=headers)
    assert res.status_code == 200
    ids = {t["id"] for t in res.json()}
    assert {world["teacher_a"].id, world["teacher_b"].id} <= ids


def test_the_teacher_directory_is_only_id_and_name(client, world):
    """A label source, not a staff directory: no email, no role."""
    headers = auth(client, "student@test.com")
    row = next(
        t
        for t in client.get("/teachers", headers=headers).json()
        if t["id"] == world["teacher_a"].id
    )
    assert set(row) == {"id", "full_name"}


def test_only_teachers_are_listed(client, world):
    headers = auth(client, "admin@test.com")
    ids = {t["id"] for t in client.get("/teachers", headers=headers).json()}
    assert world["student"].id not in ids
    assert world["admin"].id not in ids


def test_the_teacher_directory_needs_authentication(client, world):
    assert client.get("/teachers").status_code == 401


# ---------------- Language qualifications ----------------
def test_an_admin_sets_and_reads_a_teachers_languages(client, world, db):
    headers = auth(client, "admin@test.com")
    teacher_id = world["teacher_a"].id
    language_id = db.scalar(select(Language.id))

    res = client.put(
        f"/teachers/{teacher_id}/languages",
        headers=headers,
        json={"language_ids": [language_id]},
    )
    assert res.status_code == 200
    assert [r["language_id"] for r in res.json()] == [language_id]

    listed = client.get(f"/teachers/{teacher_id}/languages", headers=headers)
    assert [r["language_id"] for r in listed.json()] == [language_id]


def test_an_unknown_language_is_rejected(client, world):
    headers = auth(client, "admin@test.com")
    res = client.put(
        f"/teachers/{world['teacher_a'].id}/languages",
        headers=headers,
        json={"language_ids": [999999]},
    )
    assert res.status_code == 404


def test_qualifications_are_not_set_on_a_non_teacher(client, world):
    headers = auth(client, "admin@test.com")
    res = client.put(
        f"/teachers/{world['student'].id}/languages",
        headers=headers,
        json={"language_ids": []},
    )
    assert res.status_code == 400


def test_a_teacher_can_read_and_update_own_languages(client, world, db):
    headers = auth(client, "teacher_a@test.com")
    teacher_id = world["teacher_a"].id
    language_id = db.scalar(select(Language.id))

    res = client.put(
        f"/teachers/{teacher_id}/languages",
        headers=headers,
        json={"language_ids": [language_id]},
    )
    assert res.status_code == 200

    listed = client.get(f"/teachers/{teacher_id}/languages", headers=headers)
    assert res.status_code == 200
    assert [r["language_id"] for r in listed.json()] == [language_id]


def test_a_teacher_cannot_modify_another_teachers_languages(client, world):
    headers = auth(client, "teacher_a@test.com")
    other_teacher_id = world["teacher_b"].id
    res = client.put(
        f"/teachers/{other_teacher_id}/languages",
        headers=headers,
        json={"language_ids": []},
    )
    assert res.status_code == 403

    res_get = client.get(f"/teachers/{other_teacher_id}/languages", headers=headers)
    assert res_get.status_code == 403


# ---------------- Availability windows ----------------
def test_an_admin_adds_and_deletes_an_availability_window(client, world, db):
    headers = auth(client, "admin@test.com")
    teacher_id = world["teacher_a"].id

    created = client.post(
        f"/teachers/{teacher_id}/availability",
        headers=headers,
        json={"day_of_week": 2, "start_time": "08:00", "end_time": "12:00"},
    )
    assert created.status_code == 201
    window_id = created.json()["id"]

    listed = client.get(f"/teachers/{teacher_id}/availability", headers=headers)
    assert [w["id"] for w in listed.json()] == [window_id]

    assert (
        client.delete(
            f"/teachers/{teacher_id}/availability/{window_id}", headers=headers
        ).status_code
        == 204
    )
    remaining = client.get(f"/teachers/{teacher_id}/availability", headers=headers)
    assert remaining.json() == []


def test_a_window_of_another_teacher_is_not_deletable_through_the_wrong_path(
    client, world, db
):
    """The window id is real, but it does not belong to the teacher in the URL."""
    headers = auth(client, "admin@test.com")
    window = TeacherAvailability(
        teacher_id=world["teacher_b"].id,
        day_of_week=3,
        start_time=time(9, 0),
        end_time=time(10, 0),
    )
    db.add(window)
    db.flush()

    res = client.delete(
        f"/teachers/{world['teacher_a'].id}/availability/{window.id}", headers=headers
    )
    assert res.status_code == 404


def test_a_teacher_can_write_own_availability_but_not_others(client, world):
    headers_a = auth(client, "teacher_a@test.com")
    teacher_a_id = world["teacher_a"].id
    teacher_b_id = world["teacher_b"].id

    # Teacher A writes own availability -> 201 CREATED
    res_own = client.post(
        f"/teachers/{teacher_a_id}/availability",
        headers=headers_a,
        json={"day_of_week": 2, "start_time": "08:00", "end_time": "12:00"},
    )
    assert res_own.status_code == 201

    # Teacher A attempts to write Teacher B's availability -> 403 FORBIDDEN
    res_other = client.post(
        f"/teachers/{teacher_b_id}/availability",
        headers=headers_a,
        json={"day_of_week": 2, "start_time": "08:00", "end_time": "12:00"},
    )
    assert res_other.status_code == 403


def test_qualifications_are_replaced_not_appended(client, world, db):
    """PUT is a full replacement — the old set must not survive underneath."""
    headers = auth(client, "admin@test.com")
    teacher_id = world["teacher_a"].id
    first = db.scalar(select(Language.id))
    other = Language(name="Francés")
    db.add(other)
    db.flush()

    client.put(
        f"/teachers/{teacher_id}/languages",
        headers=headers,
        json={"language_ids": [first]},
    )
    client.put(
        f"/teachers/{teacher_id}/languages",
        headers=headers,
        json={"language_ids": [other.id]},
    )

    rows = db.scalars(
        select(TeacherLanguage).where(TeacherLanguage.teacher_id == teacher_id)
    ).all()
    assert [r.language_id for r in rows] == [other.id]


def test_teacher_can_declare_availability_exceeding_max_weekly_hours(client, world):
    headers = auth(client, "teacher_a@test.com")
    teacher_id = world["teacher_a"].id

    # 5 days x 9 hours = 45 hours (exceeds default cap of 40h) -> Should SUCCEED because
    # availability represents candidate working hours, decoupled from teaching load.
    # schedule_a is Monday 09:00-10:00, which is covered by 08:00-17:00.
    payload = [
        {"day_of_week": dow, "start_time": "08:00", "end_time": "17:00"}
        for dow in range(5)
    ]
    res = client.put(
        f"/teachers/{teacher_id}/availability",
        headers=headers,
        json=payload,
    )
    assert res.status_code == 200
    data = res.json()
    assert len(data) == 5

    # Check load endpoint: availability_hours should reflect 45.0h,
    # assigned_hours should reflect 1.0h from schedule_a (09:00-10:00),
    # and percentage should be 2.5% (1.0 / 40.0 * 100), not blocked!
    res_load = client.get(f"/teachers/{teacher_id}/load", headers=headers)
    assert res_load.status_code == 200
    load = res_load.json()
    assert load["availability_hours"] == 45.0
    assert load["assigned_hours"] == 1.0
    assert load["max_hours"] == 40.0
    assert load["percentage"] == 2.5


def test_teacher_with_assigned_classes_can_freely_register_and_add_availability_windows(client, world):
    """Teachers holding active classes can freely add and extend availability windows without 422 limit."""
    headers = auth(client, "teacher_a@test.com")
    teacher_id = world["teacher_a"].id

    # 1. Register 50 hours of availability (Mon-Fri 08:00 - 18:00)
    # Under old logic: 50h avail + 1h class = 51h > 40h max cap raised 422!
    initial_windows = [
        {"day_of_week": dow, "start_time": "08:00", "end_time": "18:00"}
        for dow in range(5)
    ]
    res_put = client.put(
        f"/teachers/{teacher_id}/availability",
        headers=headers,
        json=initial_windows,
    )
    assert res_put.status_code == 200

    # 2. Add an additional weekend window on Saturday (09:00 - 14:00 = 5h)
    # Under old logic: adding a window pushed total to 56h > 40h and raised 422!
    res_post = client.post(
        f"/teachers/{teacher_id}/availability",
        headers=headers,
        json={"day_of_week": 5, "start_time": "09:00", "end_time": "14:00"},
    )
    assert res_post.status_code == 201

    # 3. Total availability is now 55h, assigned load is 1.0h, occupancy is 2.5%
    res_load = client.get(f"/teachers/{teacher_id}/load", headers=headers)
    assert res_load.status_code == 200
    load = res_load.json()
    assert load["availability_hours"] == 55.0
    assert load["assigned_hours"] == 1.0
    assert load["max_hours"] == 40.0
    assert load["percentage"] == 2.5


def test_updating_availability_excluding_assigned_class_raises_409(client, world):
    headers = auth(client, "teacher_a@test.com")
    teacher_id = world["teacher_a"].id

    # schedule_a is Monday 09:00-10:00.
    # Attempting to set availability that leaves Monday morning uncovered raises 409!
    payload = [
        {"day_of_week": 0, "start_time": "14:00", "end_time": "18:00"},
        {"day_of_week": 1, "start_time": "09:00", "end_time": "17:00"},
    ]
    res = client.put(
        f"/teachers/{teacher_id}/availability",
        headers=headers,
        json=payload,
    )
    assert res.status_code == 409
    assert "Advertencia" in res.json()["detail"]
    assert "sin cobertura" in res.json()["detail"]


def test_teacher_availability_schedule_conflict_raises_422(client, world):
    headers = auth(client, "teacher_a@test.com")
    teacher_id = world["teacher_a"].id

    # Overlapping availability windows on the same day -> 422
    payload = [
        {"day_of_week": 0, "start_time": "08:00", "end_time": "12:00"},
        {"day_of_week": 0, "start_time": "10:00", "end_time": "14:00"},
    ]
    res = client.put(
        f"/teachers/{teacher_id}/availability",
        headers=headers,
        json=payload,
    )
    assert res.status_code == 422
    assert "Conflicto de horario" in res.json()["detail"]


def test_releasing_availability_with_assigned_class_raises_warning_409(client, world, db):
    headers = auth(client, "teacher_a@test.com")
    teacher_id = world["teacher_a"].id

    # Create an availability window matching teacher_a's schedule_a
    avail = TeacherAvailability(
        teacher_id=teacher_id,
        day_of_week=world["schedule_a"].day_of_week,
        start_time=world["schedule_a"].start_time,
        end_time=world["schedule_a"].end_time,
    )
    db.add(avail)
    db.flush()

    # Attempting to delete this availability window must raise HTTP 409 warning
    res = client.delete(
        f"/teachers/{teacher_id}/availability/{avail.id}",
        headers=headers,
    )
    assert res.status_code == 409
    assert "Advertencia" in res.json()["detail"]


def test_patch_availability_excluding_assigned_class_raises_409(client, world, db):
    headers = auth(client, "teacher_a@test.com")
    teacher_id = world["teacher_a"].id

    # Create window covering schedule_a (Mon 09:00-10:00)
    avail = TeacherAvailability(
        teacher_id=teacher_id,
        day_of_week=0,
        start_time=time(8, 0),
        end_time=time(12, 0),
    )
    db.add(avail)
    db.flush()

    # Move window away from Monday 09:00-10:00 (e.g. to Monday 14:00-17:00) -> 409
    res = client.patch(
        f"/teachers/{teacher_id}/availability/{avail.id}",
        headers=headers,
        json={"day_of_week": 0, "start_time": "14:00", "end_time": "17:00"},
    )
    assert res.status_code == 409
    assert "Advertencia" in res.json()["detail"]
    assert "sin cobertura" in res.json()["detail"]


def test_patch_availability_preserving_assigned_class_succeeds(client, world, db):
    headers = auth(client, "teacher_a@test.com")
    teacher_id = world["teacher_a"].id

    # Create window covering schedule_a (Mon 09:00-10:00)
    avail = TeacherAvailability(
        teacher_id=teacher_id,
        day_of_week=0,
        start_time=time(8, 0),
        end_time=time(12, 0),
    )
    db.add(avail)
    db.flush()

    # Expand window to Monday 08:00-14:00 (still covers 09:00-10:00) -> 200 OK
    res = client.patch(
        f"/teachers/{teacher_id}/availability/{avail.id}",
        headers=headers,
        json={"day_of_week": 0, "start_time": "08:00", "end_time": "14:00"},
    )
    assert res.status_code == 200
    assert res.json()["end_time"] == "14:00:00"


def test_validate_teacher_weekly_load_unit(db, world):
    from app.services.teacher_service import validate_teacher_weekly_load
    from fastapi import HTTPException
    import pytest

    teacher_id = world["teacher_a"].id
    # world["teacher_a"] has schedule_a (1 hour = 60 mins). Default max is 40h.
    # Testing with additional_minutes that would push past 40h (e.g. 40h * 60 = 2400 mins)
    with pytest.raises(HTTPException) as exc_info:
        validate_teacher_weekly_load(db, teacher_id, additional_minutes=40 * 60)
    assert exc_info.value.status_code == 422
    assert "excede el límite de horas lectivas" in exc_info.value.detail
