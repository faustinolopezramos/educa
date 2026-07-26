"""Self-service profile editing: PATCH /auth/me.

Every role can update their own name/timezone and change their own
password, but never their role, email, or another user's account.
"""

from tests.conftest import auth


def test_a_student_can_update_their_own_name_and_timezone(client, world):
    headers = auth(client, "student@test.com")
    res = client.patch(
        "/auth/me",
        headers=headers,
        json={"full_name": "Nuevo Nombre", "timezone": "America/Mexico_City"},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["full_name"] == "Nuevo Nombre"
    assert body["timezone"] == "America/Mexico_City"


def test_a_teacher_can_change_their_own_password_with_the_current_one(client, world):
    headers = auth(client, "teacher_a@test.com")
    res = client.patch(
        "/auth/me",
        headers=headers,
        json={"current_password": "secret123", "password": "new-secret-1"},
    )
    assert res.status_code == 200, res.text
    # The old password no longer works, the new one does.
    assert (
        client.post(
            "/auth/login",
            data={"username": "teacher_a@test.com", "password": "secret123"},
        ).status_code
        == 401
    )
    assert auth(client, "teacher_a@test.com", "new-secret-1")


def test_changing_password_without_the_current_one_is_rejected(client, world):
    headers = auth(client, "student@test.com")
    res = client.patch("/auth/me", headers=headers, json={"password": "new-secret-1"})
    assert res.status_code == 422


def test_changing_password_with_the_wrong_current_one_is_rejected(client, world):
    headers = auth(client, "student@test.com")
    res = client.patch(
        "/auth/me",
        headers=headers,
        json={"current_password": "not-the-real-one", "password": "new-secret-1"},
    )
    assert res.status_code == 400
    # The password did not change.
    assert auth(client, "student@test.com", "secret123")


def test_a_new_password_is_still_held_to_the_length_rule(client, world):
    headers = auth(client, "student@test.com")
    res = client.patch(
        "/auth/me",
        headers=headers,
        json={"current_password": "secret123", "password": "short"},
    )
    assert res.status_code == 422


def test_self_update_cannot_change_role_or_email(client, world):
    """Only /users (admin-only) may touch these; the self-service endpoint
    silently ignores fields it doesn't recognize rather than granting them."""
    headers = auth(client, "student@test.com")
    res = client.patch(
        "/auth/me",
        headers=headers,
        json={"role": "admin", "email": "hijacked@test.com"},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["role"] == "student"
    assert body["email"] == "student@test.com"


def test_self_update_requires_authentication(client, world):
    res = client.patch("/auth/me", json={"full_name": "Nobody"})
    assert res.status_code == 401


def test_a_student_can_set_their_own_contact_info(client, world):
    admin = auth(client, "admin@test.com")
    nat = client.post(
        "/catalog/nationalities", headers=admin, json={"name": "Cuba"}
    ).json()

    headers = auth(client, "student@test.com")
    res = client.patch(
        "/auth/me",
        headers=headers,
        json={
            "phone": "+502 1234-5678",
            "address": "Ciudad de Guatemala",
            "nationality_id": nat["id"],
        },
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["phone"] == "+502 1234-5678"
    assert body["address"] == "Ciudad de Guatemala"
    assert body["nationality_id"] == nat["id"]


def test_changing_password_revokes_existing_refresh_tokens(client, world):
    login = client.post(
        "/auth/login", data={"username": "teacher_a@test.com", "password": "secret123"}
    ).json()
    old_refresh_token = login["refresh_token"]

    headers = {"Authorization": f"Bearer {login['access_token']}"}
    res = client.patch(
        "/auth/me",
        headers=headers,
        json={"current_password": "secret123", "password": "new-secret-1"},
    )
    assert res.status_code == 200, res.text

    # The refresh token issued before the password change no longer works.
    refreshed = client.post("/auth/refresh", json={"refresh_token": old_refresh_token})
    assert refreshed.status_code == 401

    # A fresh login (and its refresh token) still works.
    new_login = client.post(
        "/auth/login",
        data={"username": "teacher_a@test.com", "password": "new-secret-1"},
    ).json()
    assert (
        client.post(
            "/auth/refresh", json={"refresh_token": new_login["refresh_token"]}
        ).status_code
        == 200
    )
