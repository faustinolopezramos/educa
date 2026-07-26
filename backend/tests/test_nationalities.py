"""Nationality catalog: same shape and permissions as Language."""

from tests.conftest import auth


def test_admin_can_manage_nationalities(client, world):
    admin = auth(client, "admin@test.com")

    created = client.post(
        "/catalog/nationalities", headers=admin, json={"name": "Guatemala"}
    )
    assert created.status_code == 201, created.text
    nat_id = created.json()["id"]

    listed = client.get("/catalog/nationalities", headers=admin).json()
    assert any(n["name"] == "Guatemala" for n in listed)

    updated = client.patch(
        f"/catalog/nationalities/{nat_id}", headers=admin, json={"name": "Guatemalteca"}
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["name"] == "Guatemalteca"

    deleted = client.delete(f"/catalog/nationalities/{nat_id}", headers=admin)
    assert deleted.status_code == 204


def test_a_non_admin_cannot_manage_nationalities(client, world):
    student = auth(client, "student@test.com")
    res = client.post("/catalog/nationalities", headers=student, json={"name": "Chile"})
    assert res.status_code == 403


def test_a_user_can_be_assigned_a_nationality(client, world):
    admin = auth(client, "admin@test.com")
    nat = client.post(
        "/catalog/nationalities", headers=admin, json={"name": "Chile"}
    ).json()

    user = client.post(
        "/users",
        headers=admin,
        json={
            "email": "nueva_persona@test.com",
            "full_name": "Nueva Persona",
            "role": "student",
            "password": "secret123",
            "phone": "+502 5555-0000",
            "address": "Zona 1, Ciudad",
            "nationality_id": nat["id"],
        },
    )
    assert user.status_code == 201, user.text
    body = user.json()
    assert body["phone"] == "+502 5555-0000"
    assert body["address"] == "Zona 1, Ciudad"
    assert body["nationality_id"] == nat["id"]
