"""Nationality catalog.

Unlike Language, this list is *not* per-academy: it is one shared table of
countries. That is exactly why editing it is a superadmin's job — a rename or a
delete here reaches into every academy's student records at once
(`users.nationality_id` is ON DELETE SET NULL). Reading stays open to anyone
signed in, since a form needs to render the options.
"""

import pytest

from app.core.security import hash_password
from app.models import User, UserRole
from tests.conftest import auth


@pytest.fixture
def root(db):
    """A tenant-less superadmin — the account that administers the installation."""
    user = User(
        email="root@test.com",
        full_name="Super Admin",
        role=UserRole.superadmin,
        password_hash=hash_password("secret123"),
        tenant_id=None,
    )
    db.add(user)
    db.flush()
    return user


def test_a_superadmin_can_manage_nationalities(client, world, root):
    headers = auth(client, "root@test.com")

    created = client.post(
        "/catalog/nationalities", headers=headers, json={"name": "Guatemala"}
    )
    assert created.status_code == 201, created.text
    nat_id = created.json()["id"]

    listed = client.get("/catalog/nationalities", headers=headers).json()
    assert any(n["name"] == "Guatemala" for n in listed)

    updated = client.patch(
        f"/catalog/nationalities/{nat_id}",
        headers=headers,
        json={"name": "Guatemalteca"},
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["name"] == "Guatemalteca"

    deleted = client.delete(f"/catalog/nationalities/{nat_id}", headers=headers)
    assert deleted.status_code == 204


def test_an_academy_admin_cannot_edit_the_shared_country_list(client, world, db, root):
    """One academy's admin must not rename or delete a row every other academy
    references."""
    admin = auth(client, "admin@test.com")
    superadmin = auth(client, "root@test.com")
    nat_id = client.post(
        "/catalog/nationalities", headers=superadmin, json={"name": "Guatemala"}
    ).json()["id"]

    assert (
        client.post(
            "/catalog/nationalities", headers=admin, json={"name": "Chile"}
        ).status_code
        == 403
    )
    assert (
        client.patch(
            f"/catalog/nationalities/{nat_id}", headers=admin, json={"name": "Otra"}
        ).status_code
        == 403
    )
    assert (
        client.delete(f"/catalog/nationalities/{nat_id}", headers=admin).status_code
        == 403
    )


def test_an_admin_can_still_read_the_country_list(client, world, db, root):
    """Reading is not the risk: a user form has to render the options."""
    superadmin = auth(client, "root@test.com")
    client.post(
        "/catalog/nationalities", headers=superadmin, json={"name": "Guatemala"}
    )

    admin = auth(client, "admin@test.com")
    listed = client.get("/catalog/nationalities", headers=admin)
    assert listed.status_code == 200
    assert any(n["name"] == "Guatemala" for n in listed.json())


def test_a_non_admin_cannot_manage_nationalities(client, world):
    student = auth(client, "student@test.com")
    res = client.post("/catalog/nationalities", headers=student, json={"name": "Chile"})
    assert res.status_code == 403


def test_a_user_can_be_assigned_a_nationality(client, world, root):
    admin = auth(client, "admin@test.com")
    nat = client.post(
        "/catalog/nationalities",
        headers=auth(client, "root@test.com"),
        json={"name": "Chile"},
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
