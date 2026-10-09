"""Contraseñas iniciales y la importación masiva de alumnos.

Antes toda cuenta nueva nacía con la misma contraseña, publicada en el propio
JavaScript, y un fallo en una fila de la importación tiraba el lote entero.
"""

from app.models import User

from tests.conftest import auth


def _create(client, headers, **extra):
    payload = {
        "email": "nuevo@test.com",
        "full_name": "Alumno Nuevo",
        "role": "student",
        "cui_passport": "1234567890101",
        **extra,
    }
    return client.post("/users", json=payload, headers=headers)


def test_create_without_password_returns_a_generated_one(client, world):
    admin = auth(client, "admin@test.com")
    res = _create(client, admin)
    assert res.status_code == 201, res.text
    generated = res.json()["generated_password"]
    assert generated and len(generated) >= 12
    assert generated != "Educa2026!"

    login = client.post(
        "/auth/login", data={"username": "nuevo@test.com", "password": generated}
    )
    assert login.status_code == 200


def test_create_with_password_does_not_echo_it(client, world):
    admin = auth(client, "admin@test.com")
    res = _create(client, admin, password="propia-123")
    assert res.status_code == 201, res.text
    assert res.json()["generated_password"] is None


def test_generated_passwords_differ_between_accounts(client, world):
    admin = auth(client, "admin@test.com")
    first = _create(client, admin).json()["generated_password"]
    second = _create(
        client, admin, email="otro@test.com", cui_passport="9876543210101"
    ).json()["generated_password"]
    assert first != second


def test_bulk_import_keeps_good_rows_around_a_bad_one(client, db, world):
    admin = auth(client, "admin@test.com")
    res = client.post(
        "/users/bulk-import",
        json={
            "students": [
                {"full_name": "Uno", "email": "uno@test.com", "cui_passport": "11112222"},
                # Mismo documento que la fila anterior: choca contra el índice.
                {"full_name": "Dos", "email": "dos@test.com", "cui_passport": "11112222"},
                {"full_name": "Tres", "email": "tres@test.com"},
            ]
        },
        headers=admin,
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["created_count"] == 2
    assert body["error_count"] == 1
    statuses = [r["status"] for r in body["results"]]
    assert statuses == ["created", "error", "created"]

    emails = {u.email for u in db.query(User).filter(User.email.like("%@test.com"))}
    assert {"uno@test.com", "tres@test.com"} <= emails
    assert "dos@test.com" not in emails


def test_bulk_import_returns_a_password_per_created_row(client, world):
    admin = auth(client, "admin@test.com")
    res = client.post(
        "/users/bulk-import",
        json={
            "students": [
                {"full_name": "Uno", "email": "uno@test.com"},
                {"full_name": "Dos", "email": "dos@test.com", "password": "propia-123"},
            ]
        },
        headers=admin,
    )
    rows = res.json()["results"]
    assert rows[0]["generated_password"]
    assert rows[1]["generated_password"] is None
    login = client.post(
        "/auth/login",
        data={"username": "uno@test.com", "password": rows[0]["generated_password"]},
    )
    assert login.status_code == 200


def test_bulk_import_validates_row_passwords(client, world):
    admin = auth(client, "admin@test.com")
    res = client.post(
        "/users/bulk-import",
        json={"students": [{"full_name": "Uno", "email": "uno@test.com", "password": "1234"}]},
        headers=admin,
    )
    assert res.status_code == 422


def test_bulk_import_rejects_oversized_batches(client, world):
    admin = auth(client, "admin@test.com")
    rows = [{"full_name": f"A {i}", "email": f"a{i}@test.com"} for i in range(501)]
    res = client.post("/users/bulk-import", json={"students": rows}, headers=admin)
    assert res.status_code == 422


# ---------------- Correos sin distinguir mayúsculas ----------------


def test_an_account_created_with_capitals_logs_in_with_lowercase(client, world):
    admin = auth(client, "admin@test.com")
    res = _create(client, admin, email="Ana.Perez@Test.COM", password="propia-123")
    assert res.status_code == 201, res.text
    assert res.json()["email"] == "ana.perez@test.com"

    for typed in ("ana.perez@test.com", "ANA.PEREZ@test.com", " Ana.Perez@Test.com "):
        login = client.post(
            "/auth/login", data={"username": typed, "password": "propia-123"}
        )
        assert login.status_code == 200, typed


def test_the_same_email_with_other_capitals_is_a_duplicate(client, world):
    admin = auth(client, "admin@test.com")
    assert _create(client, admin, email="ana@test.com").status_code == 201
    res = _create(
        client, admin, email="ANA@test.com", cui_passport="5555666677"
    )
    assert res.status_code == 409


def test_bulk_import_recognises_an_existing_account_regardless_of_case(client, world):
    admin = auth(client, "admin@test.com")
    assert _create(client, admin, email="Ana@Test.com").status_code == 201
    res = client.post(
        "/users/bulk-import",
        json={"students": [{"full_name": "Ana", "email": "ana@test.com"}]},
        headers=admin,
    )
    assert res.json()["results"][0]["status"] == "skipped"
