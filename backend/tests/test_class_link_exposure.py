"""The class link must not be readable off the timetable.

`GET /meetings/session/{id}/lobby-info` only hands `join_url` to a student
inside the class window. That gate is worth nothing if the same URL can be read
from `GET /schedules` at any hour, which is what used to happen: the lobby
answered `can_join=false, join_url=null` while the timetable returned the link
in full.
"""

from tests.conftest import auth


def test_a_student_never_receives_the_class_link_from_the_timetable(client, db, world):
    world["schedule_a"].join_url = "https://zoom.us/j/CLASS-LINK"
    db.flush()

    listed = client.get("/schedules", headers=auth(client, "student@test.com")).json()

    assert listed, "the student should still see their own timetable"
    assert all(s["join_url"] is None for s in listed)


def test_staff_still_receive_the_class_link(client, db, world):
    world["schedule_a"].join_url = "https://zoom.us/j/CLASS-LINK"
    db.flush()

    # The teacher sets the link up and the admin verifies it, so hiding it from
    # them would break the flow the gate exists to protect.
    for email in ("teacher_a@test.com", "admin@test.com"):
        listed = client.get("/schedules", headers=auth(client, email)).json()
        links = [s["join_url"] for s in listed if s["join_url"]]
        assert "https://zoom.us/j/CLASS-LINK" in links, email
