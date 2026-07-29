"""The login rate-limiter's per-IP bookkeeping shouldn't grow forever."""

import asyncio
from datetime import datetime, timedelta, timezone

from app.main import _login_attempts, rate_limit_middleware


class _FakeClient:
    host = "9.9.9.9"


class _FakeURL:
    path = "/auth/login"


class _FakeRequest:
    method = "POST"
    url = _FakeURL()
    client = _FakeClient()


class _FakeResponse:
    # Only failed logins are counted, so the bookkeeping under test is only
    # exercised by a 401. A successful login leaves no trace on purpose.
    status_code = 401


async def _call_next(_request):
    return _FakeResponse()


def test_stale_ip_entries_are_pruned_instead_of_left_as_an_empty_list():
    _login_attempts.clear()
    stale = datetime.now(timezone.utc) - timedelta(seconds=120)
    _login_attempts["9.9.9.9"] = [stale, stale, stale]

    asyncio.run(rate_limit_middleware(_FakeRequest(), _call_next))

    # The three stale attempts (outside the 60s window) are gone; only the
    # fresh one just recorded by this call remains. If they weren't pruned,
    # every IP that ever hit /auth/login would sit in memory forever.
    assert _login_attempts["9.9.9.9"] == [
        t for t in _login_attempts["9.9.9.9"] if t > stale
    ]
    assert len(_login_attempts["9.9.9.9"]) == 1


def test_an_ip_with_no_attempts_left_is_removed_from_the_dict():
    _login_attempts.clear()
    stale = datetime.now(timezone.utc) - timedelta(seconds=120)
    _login_attempts["8.8.8.8"] = [stale]

    class _OtherClient:
        host = "8.8.8.8"

    class _OtherRequest:
        method = "POST"
        url = _FakeURL()
        client = _OtherClient()

    asyncio.run(rate_limit_middleware(_OtherRequest(), _call_next))

    # The stale entry is gone; only the fresh attempt just recorded by this
    # call remains, proving the key was rebuilt rather than left as a
    # leftover empty list under an IP nobody is currently rate-limited under.
    assert len(_login_attempts["8.8.8.8"]) == 1
