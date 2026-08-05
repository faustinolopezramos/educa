"""Catálogo Académico: Idiomas / Competencias Digitales / Competencias de
Negocios all reuse the same Language→Level→Course tree, distinguished only by
`Language.kind` — a display-grouping label, not a schema fork."""

from tests.conftest import auth


def test_language_defaults_to_the_language_kind(client, world):
    admin = auth(client, "admin@test.com")
    res = client.post("/catalog/languages", headers=admin, json={"name": "Francés"})
    assert res.status_code == 201, res.text
    assert res.json()["kind"] == "language"


def test_a_skill_track_reuses_the_same_language_level_tree(client, world):
    """Competencias Digitales/Negocios courses are modeled exactly like a
    language: a Language row (kind=digital_skill/business_skill) with Level
    rows underneath — here playing the role of "módulos" instead of CEFR
    stages."""
    admin = auth(client, "admin@test.com")
    track = client.post(
        "/catalog/languages",
        headers=admin,
        json={"name": "Marketing Digital", "kind": "digital_skill"},
    )
    assert track.status_code == 201, track.text
    track_id = track.json()["id"]

    modulo1 = client.post(
        "/catalog/levels",
        headers=admin,
        json={"language_id": track_id, "code": "M1", "name": "Módulo 1"},
    )
    assert modulo1.status_code == 201, modulo1.text

    course = client.post(
        "/catalog/courses",
        headers=admin,
        json={"level_id": modulo1.json()["id"], "name": "Marketing Digital - Módulo 1"},
    )
    assert course.status_code == 201, course.text


def test_modality_accepts_semi_presencial(client, world):
    """A location proposal (admin proposing self-approves) may now set the
    schedule's effective modality to `semi_presencial`, the value added
    alongside the pre-existing Presencial/Virtual."""
    admin = auth(client, "admin@test.com")
    room = client.post(
        "/rooms", headers=admin, json={"name": "Aula Mixta", "capacity": 20}
    ).json()

    res = client.post(
        f"/schedules/{world['schedule_a'].id}/location/propose",
        headers=admin,
        json={
            "modality": "semi_presencial",
            "room_id": room["id"],
            "join_url": "https://meet.google.com/demo-meet-link",
        },
    )
    assert res.status_code == 201, res.text
    assert res.json()["modality"] == "semi_presencial"
    assert res.json()["status"] == "approved"
