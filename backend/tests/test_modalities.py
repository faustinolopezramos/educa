"""Qué necesita cada modalidad para poder impartirse.

Las tres se tratan por separado. Estaban implícitas en un `if virtual … else …`
cuyo `else` metía en el mismo saco a presencial y a **semi presencial**, con dos
consecuencias:

* una clase semi presencial no podía tener enlace — el validador lo borraba en
  silencio, así que la mitad en línea de la clase no existía en ninguna parte;
* su aula no se comprobaba contra doble reserva, y el choque lo acababa
  atrapando la restricción de la base de datos como un 500.
"""

from datetime import date, time, timedelta

import pytest

from app.models import (
    MODALITY_NEEDS_LINK,
    MODALITY_USES_ROOM,
    Modality,
    Room,
    Schedule,
)
from app.schemas.location import LocationProposalCreate
from tests.conftest import auth


# ---------------------------------------------------------------------------
# Las dos preguntas, por separado
# ---------------------------------------------------------------------------
def test_semi_presencial_answers_yes_to_both():
    """Es una clase que ocurre en el aula *y* en línea a la vez."""
    assert Modality.semi_presencial in MODALITY_USES_ROOM
    assert Modality.semi_presencial in MODALITY_NEEDS_LINK


def test_presencial_uses_a_room_and_no_link():
    assert Modality.presencial in MODALITY_USES_ROOM
    assert Modality.presencial not in MODALITY_NEEDS_LINK


def test_virtual_needs_a_link_and_no_room():
    assert Modality.virtual in MODALITY_NEEDS_LINK
    assert Modality.virtual not in MODALITY_USES_ROOM


# ---------------------------------------------------------------------------
# El validador de la propuesta
# ---------------------------------------------------------------------------
def test_a_semi_presencial_proposal_keeps_its_link():
    """El fallo original: el enlace se descartaba sin decir nada."""
    proposal = LocationProposalCreate(
        modality=Modality.semi_presencial,
        room_id=7,
        join_url="https://meet.example.com/abc",
    )
    assert proposal.join_url == "https://meet.example.com/abc"
    assert proposal.room_id == 7
    # Sin proveedor explícito se asume el manual, igual que en virtual.
    assert proposal.provider is not None


def test_a_semi_presencial_proposal_needs_both_halves():
    with pytest.raises(ValueError, match="enlace"):
        LocationProposalCreate(modality=Modality.semi_presencial, room_id=7)
    with pytest.raises(ValueError, match="aula"):
        LocationProposalCreate(
            modality=Modality.semi_presencial, join_url="https://x.test/a"
        )


def test_a_virtual_proposal_does_not_hold_a_room():
    """Un aula reservada por una clase virtual la bloquea para quien sí la usa."""
    proposal = LocationProposalCreate(
        modality=Modality.virtual, room_id=7, join_url="https://x.test/a"
    )
    assert proposal.room_id is None


def test_a_presencial_proposal_carries_no_link():
    proposal = LocationProposalCreate(
        modality=Modality.presencial, room_id=7, join_url="https://x.test/a"
    )
    assert proposal.join_url is None
    assert proposal.provider is None


def test_a_presencial_proposal_needs_a_room():
    with pytest.raises(ValueError, match="aula"):
        LocationProposalCreate(modality=Modality.presencial)


# ---------------------------------------------------------------------------
# El aula ocupada, para toda modalidad que reserve una
# ---------------------------------------------------------------------------
@pytest.fixture
def busy_room(db, world):
    """Un aula ya ocupada el lunes de 9 a 10 por el horario del profesor A."""
    room = Room(name="Aula 1", capacity=20)
    db.add(room)
    db.flush()
    world["schedule_a"].room_id = room.id
    db.flush()
    return room


@pytest.fixture
def clashing_schedule(db, world):
    """Otro horario del profesor B, a la misma hora y día que el del A."""
    schedule = Schedule(
        course_id=world["course_b"].id,
        teacher_id=world["teacher_b"].id,
        day_of_week=world["schedule_a"].day_of_week,
        start_time=world["schedule_a"].start_time,
        end_time=world["schedule_a"].end_time,
        term_start=world["schedule_a"].term_start,
        term_end=world["schedule_a"].term_end,
    )
    db.add(schedule)
    db.flush()
    return schedule


@pytest.mark.parametrize("modality", ["presencial", "semi_presencial"])
def test_a_double_booked_room_is_a_conflict_not_a_crash(
    client, world, busy_room, clashing_schedule, modality
):
    """Semi presencial se saltaba esta comprobación y terminaba en 500."""
    admin = auth(client, "admin@test.com")
    body = {"modality": modality, "room_id": busy_room.id}
    if modality == "semi_presencial":
        body["join_url"] = "https://meet.example.com/x"

    res = client.post(
        f"/schedules/{clashing_schedule.id}/location/propose",
        headers=admin,
        json=body,
    )
    assert res.status_code == 409, res.text
    assert res.json()["detail"]["reason"] == "room_conflict"


def test_a_virtual_class_does_not_compete_for_the_room(
    client, world, busy_room, clashing_schedule
):
    """No reserva aula, así que no puede chocar con nadie por ella."""
    admin = auth(client, "admin@test.com")
    res = client.post(
        f"/schedules/{clashing_schedule.id}/location/propose",
        headers=admin,
        json={
            "modality": "virtual",
            "room_id": busy_room.id,
            "join_url": "https://meet.example.com/x",
        },
    )
    assert res.status_code == 201, res.text
    assert res.json()["room_id"] is None


def test_the_teacher_can_propose_a_semi_presencial_class_end_to_end(
    client, db, world
):
    room = Room(name="Aula 9", capacity=15)
    db.add(room)
    db.flush()

    teacher = auth(client, "teacher_a@test.com")
    proposed = client.post(
        f"/schedules/{world['schedule_a'].id}/location/propose",
        headers=teacher,
        json={
            "modality": "semi_presencial",
            "room_id": room.id,
            "join_url": "https://meet.example.com/hibrida",
        },
    )
    assert proposed.status_code == 201, proposed.text
    proposal_id = proposed.json()["id"]

    admin = auth(client, "admin@test.com")
    approved = client.post(
        f"/location-proposals/{proposal_id}/approve", headers=admin
    )
    assert approved.status_code == 200, approved.text

    # El horario acaba con las dos mitades, que es lo que antes se perdía.
    db.refresh(world["schedule_a"])
    assert world["schedule_a"].modality is Modality.semi_presencial
    assert world["schedule_a"].room_id == room.id
    assert world["schedule_a"].join_url == "https://meet.example.com/hibrida"


# ---------------------------------------------------------------------------
# La modalidad que elige dirección al crear el horario
#
# `ScheduleCreate` no declaraba `modality` ni `join_url`, y Pydantic descarta lo
# que no declara: el asistente de cursos los enviaba en cada franja y se perdían
# por el camino, así que **toda** franja nacía presencial sin enlace dijera lo
# que dijera el formulario. La única forma de corregirlo era, después, una a una
# por el flujo de propuesta de ubicación.
# ---------------------------------------------------------------------------
def _slot(world, **over):
    body = {
        "course_id": world["course_a"].id,
        "teacher_id": world["teacher_a"].id,
        "day_of_week": 3,
        "start_time": "14:00:00",
        "end_time": "15:00:00",
    }
    body.update(over)
    return body


def test_the_modality_chosen_when_creating_a_slot_actually_arrives(client, world):
    admin = auth(client, "admin@test.com")
    res = client.post(
        "/schedules",
        headers=admin,
        json=_slot(world, modality="virtual", join_url="https://meet.example.com/x"),
    )
    assert res.status_code == 201, res.text
    assert res.json()["modality"] == "virtual"
    assert res.json()["join_url"] == "https://meet.example.com/x"


def test_a_slot_created_without_saying_anything_is_presencial(client, world):
    """El valor por defecto no cambia, para no alterar lo que ya existía."""
    admin = auth(client, "admin@test.com")
    res = client.post("/schedules", headers=admin, json=_slot(world))
    assert res.status_code == 201, res.text
    assert res.json()["modality"] == "presencial"


def test_a_semi_presencial_slot_is_born_with_both_halves(client, db, world):
    room = Room(name="Aula Híbrida", capacity=12)
    db.add(room)
    db.flush()

    admin = auth(client, "admin@test.com")
    res = client.post(
        "/schedules",
        headers=admin,
        json=_slot(
            world,
            modality="semi_presencial",
            room_id=room.id,
            join_url="https://meet.example.com/h",
        ),
    )
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["room_id"] == room.id
    assert body["join_url"] == "https://meet.example.com/h"


@pytest.mark.parametrize(
    "body, why",
    [
        ({"modality": "presencial", "join_url": "https://x.test/a"}, "enlace"),
        ({"modality": "virtual", "room_id": 1}, "aula"),
    ],
)
def test_an_incoherent_location_is_refused_at_creation(client, world, body, why):
    """No exige aula ni enlace —se pueden rellenar después— pero sí rechaza lo
    que se contradice: un enlace en una presencial, un aula en una virtual."""
    admin = auth(client, "admin@test.com")
    res = client.post("/schedules", headers=admin, json=_slot(world, **body))
    assert res.status_code == 422, res.text
    assert why in res.text


def test_a_slot_may_be_created_before_knowing_where_it_will_be_held(client, world):
    """El flujo de propuesta existe justo para rellenarlo más tarde."""
    admin = auth(client, "admin@test.com")
    res = client.post(
        "/schedules", headers=admin, json=_slot(world, modality="virtual")
    )
    assert res.status_code == 201, res.text
    assert res.json()["join_url"] is None
