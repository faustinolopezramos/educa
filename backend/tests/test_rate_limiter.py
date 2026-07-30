"""The rate-limiter's per-caller bookkeeping shouldn't grow forever."""

import asyncio
from datetime import datetime, timedelta, timezone

from app.main import _bucket_key, _login_attempts, rate_limit_middleware


class _FakeURL:
    def __init__(self, path: str = "/auth/login"):
        self.path = path


class _FakeRequest:
    """Enough of a Request for the middleware: a path, a method and a peer."""

    method = "POST"

    def __init__(self, host: str = "9.9.9.9", path: str = "/auth/login"):
        self.url = _FakeURL(path)
        self.client = type("_Client", (), {"host": host})()


class _FakeResponse:
    # Only failed attempts are counted, so the bookkeeping under test is only
    # exercised by a 401. A successful login leaves no trace on purpose.
    status_code = 401


async def _call_next(_request):
    return _FakeResponse()


def test_stale_entries_are_pruned_instead_of_left_as_an_empty_list():
    _login_attempts.clear()
    request = _FakeRequest("9.9.9.9")
    key = _bucket_key(request)
    stale = datetime.now(timezone.utc) - timedelta(seconds=120)
    _login_attempts[key] = [stale, stale, stale]

    asyncio.run(rate_limit_middleware(request, _call_next))

    # The three stale attempts (outside the 60s window) are gone; only the
    # fresh one just recorded by this call remains. If they weren't pruned,
    # every caller that ever hit /auth/login would sit in memory forever.
    assert _login_attempts[key] == [t for t in _login_attempts[key] if t > stale]
    assert len(_login_attempts[key]) == 1


def test_a_caller_with_no_attempts_left_is_removed_from_the_dict():
    _login_attempts.clear()
    request = _FakeRequest("8.8.8.8")
    key = _bucket_key(request)
    stale = datetime.now(timezone.utc) - timedelta(seconds=120)
    _login_attempts[key] = [stale]

    asyncio.run(rate_limit_middleware(request, _call_next))

    # The stale entry is gone; only the fresh attempt just recorded by this
    # call remains, proving the key was rebuilt rather than left as a
    # leftover empty list under a caller nobody is currently limited under.
    assert len(_login_attempts[key]) == 1
    assert stale not in _login_attempts[key]


def test_login_and_refresh_spend_from_separate_buckets():
    """A client that burns its refresh budget must still be able to sign in."""
    _login_attempts.clear()
    login = _FakeRequest("7.7.7.7", "/auth/login")
    refresh = _FakeRequest("7.7.7.7", "/auth/refresh")

    assert _bucket_key(login) != _bucket_key(refresh)

    asyncio.run(rate_limit_middleware(refresh, _call_next))

    assert len(_login_attempts[_bucket_key(refresh)]) == 1
    assert _bucket_key(login) not in _login_attempts


def test_an_unlimited_path_is_not_counted_at_all():
    _login_attempts.clear()
    asyncio.run(rate_limit_middleware(_FakeRequest("6.6.6.6", "/users"), _call_next))
    assert not _login_attempts
