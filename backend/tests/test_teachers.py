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


def test_a_teacher_may_not_read_qualifications(client, world):
    headers = auth(client, "teacher_a@test.com")
    res = client.get(f"/teachers/{world['teacher_a'].id}/languages", headers=headers)
    assert res.status_code == 403


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


def test_a_teacher_may_not_write_their_own_availability(client, world):
    headers = auth(client, "teacher_a@test.com")
    res = client.post(
        f"/teachers/{world['teacher_a'].id}/availability",
        headers=headers,
        json={"day_of_week": 2, "start_time": "08:00", "end_time": "12:00"},
    )
    assert res.status_code == 403


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
