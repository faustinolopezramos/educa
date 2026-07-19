"""Where a class is held: teacher proposes, admin approves."""

from tests.conftest import auth


def _virtual(url="https://meet.example.com/abc"):
    return {"modality": "virtual", "join_url": url}


def _presencial(room_id):
    return {"modality": "presencial", "room_id": room_id}


# ---------------- Proposing ----------------
def test_a_teacher_proposes_a_virtual_link_and_admin_approves(client, world, db):
    schedule_id = world["schedule_a"].id
    teacher = auth(client, "teacher_a@test.com")

    res = client.post(
        f"/schedules/{schedule_id}/location/propose", headers=teacher, json=_virtual()
    )
    assert res.status_code == 201, res.text
    proposal = res.json()
    assert proposal["status"] == "pending"
    assert proposal["provider"] == "manual"  # defaulted for a virtual class

    # The schedule is untouched while the proposal is pending.
    admin = auth(client, "admin@test.com")
    before = next(
        s for s in client.get("/schedules", headers=admin).json() if s["id"] == schedule_id
    )
    assert before["join_url"] is None

    approved = client.post(
        f"/location-proposals/{proposal['id']}/approve", headers=admin
    )
    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] == "approved"

    after = next(
        s for s in client.get("/schedules", headers=admin).json() if s["id"] == schedule_id
    )
    assert after["modality"] == "virtual"
    assert after["join_url"] == "https://meet.example.com/abc"


def test_a_virtual_proposal_without_a_link_is_rejected(client, world):
    teacher = auth(client, "teacher_a@test.com")
    res = client.post(
        f"/schedules/{world['schedule_a'].id}/location/propose",
        headers=teacher,
        json={"modality": "virtual"},
    )
    assert res.status_code == 422


def test_a_presencial_proposal_needs_a_room(client, world):
    teacher = auth(client, "teacher_a@test.com")
    res = client.post(
        f"/schedules/{world['schedule_a'].id}/location/propose",
        headers=teacher,
        json={"modality": "presencial"},
    )
    assert res.status_code == 422


def test_a_teacher_cannot_propose_for_a_course_they_do_not_teach(client, world):
    teacher = auth(client, "teacher_b@test.com")
    res = client.post(
        f"/schedules/{world['schedule_a'].id}/location/propose",
        headers=teacher,
        json=_virtual(),
    )
    assert res.status_code == 403


def test_an_admin_proposal_self_approves(client, world):
    admin = auth(client, "admin@test.com")
    res = client.post(
        f"/schedules/{world['schedule_a'].id}/location/propose",
        headers=admin,
        json=_virtual("https://zoom.example.com/1"),
    )
    assert res.status_code == 201
    assert res.json()["status"] == "approved"
    after = next(
        s for s in client.get("/schedules", headers=admin).json()
        if s["id"] == world["schedule_a"].id
    )
    assert after["join_url"] == "https://zoom.example.com/1"


# ---------------- Reviewing ----------------
def test_reject_leaves_the_schedule_untouched(client, world):
    teacher = auth(client, "teacher_a@test.com")
    admin = auth(client, "admin@test.com")
    proposal = client.post(
        f"/schedules/{world['schedule_a'].id}/location/propose",
        headers=teacher,
        json=_virtual(),
    ).json()
    res = client.post(
        f"/location-proposals/{proposal['id']}/reject",
        headers=admin,
        json={"note": "Usa Meet, no ese enlace"},
    )
    assert res.status_code == 200
    assert res.json()["status"] == "rejected"
    after = next(
        s for s in client.get("/schedules", headers=admin).json()
        if s["id"] == world["schedule_a"].id
    )
    assert after["join_url"] is None


def test_a_reviewed_proposal_cannot_be_approved_again(client, world):
    teacher = auth(client, "teacher_a@test.com")
    admin = auth(client, "admin@test.com")
    proposal = client.post(
        f"/schedules/{world['schedule_a'].id}/location/propose",
        headers=teacher,
        json=_virtual(),
    ).json()
    client.post(f"/location-proposals/{proposal['id']}/approve", headers=admin)
    again = client.post(f"/location-proposals/{proposal['id']}/approve", headers=admin)
    assert again.status_code == 409


def test_a_teacher_cannot_approve(client, world):
    teacher = auth(client, "teacher_a@test.com")
    admin = auth(client, "admin@test.com")
    proposal = client.post(
        f"/schedules/{world['schedule_a'].id}/location/propose",
        headers=teacher,
        json=_virtual(),
    ).json()
    res = client.post(
        f"/location-proposals/{proposal['id']}/approve", headers=teacher
    )
    assert res.status_code == 403


def test_a_teacher_only_sees_their_own_proposals(client, world):
    ta = auth(client, "teacher_a@test.com")
    client.post(
        f"/schedules/{world['schedule_a'].id}/location/propose",
        headers=ta,
        json=_virtual(),
    )
    tb = auth(client, "teacher_b@test.com")
    assert client.get("/location-proposals", headers=tb).json() == []
    assert len(client.get("/location-proposals", headers=ta).json()) == 1


def test_approving_a_presencial_proposal_checks_room_conflicts(client, world, db):
    """Two schedules in the same room at the same time cannot both be approved."""
    from datetime import time
    from app.models import Room, Schedule

    room = Room(name="Aula compartida", is_virtual=False)
    db.add(room)
    db.flush()

    # schedule_a already exists (Mon 9-10). Put it in the room via approval.
    admin = auth(client, "admin@test.com")
    client.post(
        f"/schedules/{world['schedule_a'].id}/location/propose",
        headers=admin,
        json=_presencial(room.id),
    )

    # A different teacher's schedule in the same room + slot (no teacher clash,
    # so the room is the only thing that can collide).
    other = Schedule(
        course_id=world["course_b"].id, teacher_id=world["teacher_b"].id,
        day_of_week=0, start_time=time(9, 0), end_time=time(10, 0),
        term_start=world["course_b"].start_date, term_end=world["course_b"].end_date,
    )
    db.add(other)
    db.flush()
    teacher = auth(client, "teacher_b@test.com")
    proposal = client.post(
        f"/schedules/{other.id}/location/propose",
        headers=teacher,
        json=_presencial(room.id),
    ).json()
    res = client.post(f"/location-proposals/{proposal['id']}/approve", headers=admin)
    assert res.status_code == 409
    assert res.json()["detail"]["reason"] == "room_conflict"
