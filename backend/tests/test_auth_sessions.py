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


# ---------------- Access tokens vs. a password change ----------------
def test_changing_your_password_kills_access_tokens_issued_before_it(client, world):
    """The point of bumping `token_version` on a password change.

    `get_current_user` compares the token's `ver` claim against the user's
    current `token_version`, but nothing ever put that claim in an access token,
    so the check could not fire: the token from before the change kept working
    for the rest of its life. That is precisely the window a password change is
    supposed to shut.
    """
    login = _login(client, "student@test.com")
    old_headers = {"Authorization": f"Bearer {login['access_token']}"}
    assert client.get("/auth/me", headers=old_headers).status_code == 200

    changed = client.patch(
        "/auth/me",
        headers=old_headers,
        json={"password": "brand-new-secret", "current_password": "secret123"},
    )
    assert changed.status_code == 200, changed.text

    assert client.get("/auth/me", headers=old_headers).status_code == 401


def test_an_admin_password_reset_also_kills_the_users_access_token(client, world):
    """Same rule when someone else does the resetting — the account is being
    taken back from whoever held the old credentials."""
    victim = _login(client, "student@test.com")
    victim_headers = {"Authorization": f"Bearer {victim['access_token']}"}
    assert client.get("/auth/me", headers=victim_headers).status_code == 200

    admin_headers = auth(client, "admin@test.com")
    reset = client.patch(
        f"/users/{world['student'].id}",
        headers=admin_headers,
        json={"password": "reset-by-the-admin"},
    )
    assert reset.status_code == 200, reset.text

    assert client.get("/auth/me", headers=victim_headers).status_code == 401


def test_a_password_change_leaves_other_users_tokens_alone(client, world):
    """The revocation is per account, not a global stampede."""
    bystander = auth(client, "teacher_a@test.com")
    login = _login(client, "student@test.com")
    client.patch(
        "/auth/me",
        headers={"Authorization": f"Bearer {login['access_token']}"},
        json={"password": "brand-new-secret", "current_password": "secret123"},
    )
    assert client.get("/auth/me", headers=bystander).status_code == 200


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


# ---------------- Rate limiting ----------------
def test_refresh_is_rate_limited_like_login(client, world):
    """`/auth/refresh` mints access tokens from a bearer secret, so it is the
    second guessable door into an account. It used to have no budget at all."""
    from app.main import _RATE_LIMITED_PATHS

    limit = _RATE_LIMITED_PATHS["/auth/refresh"]
    for _ in range(limit):
        res = client.post("/auth/refresh", json={"refresh_token": "guess"})
        assert res.status_code == 401

    blocked = client.post("/auth/refresh", json={"refresh_token": "guess"})
    assert blocked.status_code == 429


def test_burning_the_refresh_budget_does_not_lock_you_out_of_login(client, world):
    """The two budgets are counted separately, so a misbehaving refresh loop
    cannot cost the same client the ability to sign in again."""
    from app.main import _RATE_LIMITED_PATHS

    for _ in range(_RATE_LIMITED_PATHS["/auth/refresh"] + 1):
        client.post("/auth/refresh", json={"refresh_token": "guess"})

    res = client.post(
        "/auth/login", data={"username": "student@test.com", "password": "secret123"}
    )
    assert res.status_code == 200
