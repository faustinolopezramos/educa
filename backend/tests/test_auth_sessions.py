"""Login credential handling and refresh-token session lifecycle."""

from tests.conftest import auth


def test_login_checks_password_even_for_an_unknown_email(client, world, monkeypatch):
    """A nonexistent email must still pay the bcrypt cost of a real check.

    Without this, `verify_password` is only ever called once a matching user
    is found, and the branch that skips it (unknown email) responds faster
    than the branch that calls it (wrong password) — a timing side channel an
    attacker could use to enumerate registered emails.
    """
    calls: list[str] = []
    import app.routers.auth as auth_module

    original = auth_module.verify_password

    def spy(plain, hashed):
        calls.append(hashed)
        return original(plain, hashed)

    monkeypatch.setattr(auth_module, "verify_password", spy)

    res = client.post(
        "/auth/login",
        data={"username": "no-such-user@test.com", "password": "whatever123"},
    )
    assert res.status_code == 401
    assert len(calls) == 1
    # It compared against the dummy hash, not skipped verification entirely.
    assert calls[0] == auth_module._DUMMY_PASSWORD_HASH


def test_login_still_rejects_wrong_password_on_a_real_account(client, world):
    res = client.post(
        "/auth/login",
        data={"username": "student@test.com", "password": "wrong-password"},
    )
    assert res.status_code == 401


def test_login_still_succeeds_with_the_right_password(client, world):
    headers = auth(client, "student@test.com")
    assert "Authorization" in headers


# ---------------- Refresh token rotation ----------------
def _login(client, email, password="secret123"):
    res = client.post("/auth/login", data={"username": email, "password": password})
    assert res.status_code == 200, res.text
    return res.json()


def test_refresh_rotates_to_a_new_refresh_token(client, world):
    login = _login(client, "student@test.com")
    res = client.post("/auth/refresh", json={"refresh_token": login["refresh_token"]})
    assert res.status_code == 200, res.text
    assert res.json()["refresh_token"] != login["refresh_token"]


def test_a_rotated_refresh_token_cannot_be_reused(client, world):
    login = _login(client, "student@test.com")
    first = client.post("/auth/refresh", json={"refresh_token": login["refresh_token"]})
    assert first.status_code == 200

    # Replaying the pre-rotation token is a reuse of an already-rotated jti.
    replay = client.post(
        "/auth/refresh", json={"refresh_token": login["refresh_token"]}
    )
    assert replay.status_code == 401


def test_reusing_a_rotated_token_revokes_every_session_of_that_user(client, world):
    """Simulates a stolen refresh token: once the theft is detected (the old
    token gets replayed), every other active session of the same user — even
    ones from a separate login — must stop working too."""
    session_1 = _login(client, "student@test.com")
    session_2 = _login(client, "student@test.com")

    # Legitimate rotation of session 1.
    rotated = client.post(
        "/auth/refresh", json={"refresh_token": session_1["refresh_token"]}
    )
    assert rotated.status_code == 200

    # The stolen (pre-rotation) token is replayed -> detected as reuse.
    replay = client.post(
        "/auth/refresh", json={"refresh_token": session_1["refresh_token"]}
    )
    assert replay.status_code == 401

    # session_2, untouched until now, is also revoked as a precaution.
    also_dead = client.post(
        "/auth/refresh", json={"refresh_token": session_2["refresh_token"]}
    )
    assert also_dead.status_code == 401

    # Even the token freshly issued by the legitimate rotation is dead now.
    dead_too = client.post(
        "/auth/refresh", json={"refresh_token": rotated.json()["refresh_token"]}
    )
    assert dead_too.status_code == 401


# ---------------- Logout ----------------
def test_logout_revokes_the_refresh_session(client, world):
    login = _login(client, "student@test.com")
    res = client.post("/auth/logout", json={"refresh_token": login["refresh_token"]})
    assert res.status_code == 204

    refreshed = client.post(
        "/auth/refresh", json={"refresh_token": login["refresh_token"]}
    )
    assert refreshed.status_code == 401


def test_logout_with_a_garbage_token_is_a_no_op_204(client, world):
    res = client.post("/auth/logout", json={"refresh_token": "not-a-real-token"})
    assert res.status_code == 204
