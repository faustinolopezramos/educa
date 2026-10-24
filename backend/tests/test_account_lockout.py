"""El bloqueo progresivo: antes era un esqueleto que nunca bloqueaba a nadie."""

from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.core.rate_limiter import MemoryRateLimiter
from app.models import User, UserRole
from app.services import account_lockout as lockout
from tests.conftest import clear_route_limits, make_user


def _service() -> lockout.AccountLockoutService:
    return lockout.AccountLockoutService(MemoryRateLimiter())


def test_a_fresh_identifier_is_not_locked():
    status = _service().check_lockout("42", lockout.USER_PREFIX)
    assert not status.is_locked and status.attempts == 0


def test_the_fifth_failure_locks_the_account_for_fifteen_minutes():
    svc = _service()
    for _ in range(4):
        assert not svc.record_failed_attempt("42", lockout.USER_PREFIX).is_locked
    status = svc.record_failed_attempt("42", lockout.USER_PREFIX)
    assert status.is_locked
    remaining = status.lockout_until - datetime.now(timezone.utc)
    assert timedelta(minutes=14) < remaining <= timedelta(minutes=15)


def test_the_lockout_grows_with_repeat_offences():
    svc = _service()
    for _ in range(10):
        status = svc.record_failed_attempt("42", lockout.USER_PREFIX)
    remaining = status.lockout_until - datetime.now(timezone.utc)
    assert timedelta(minutes=59) < remaining <= timedelta(hours=1)


def test_an_expired_lockout_lets_the_account_back_in():
    limiter = MemoryRateLimiter()
    svc = lockout.AccountLockoutService(limiter)
    for _ in range(5):
        svc.record_failed_attempt("42", lockout.USER_PREFIX)
    key = "lockout:user:42:lockout"
    limiter.set_deadline(key, datetime.now(timezone.utc) - timedelta(seconds=1))
    assert not svc.check_lockout("42", lockout.USER_PREFIX).is_locked


def test_accounts_are_counted_independently():
    svc = _service()
    for _ in range(5):
        svc.record_failed_attempt("1", lockout.USER_PREFIX)
    assert svc.check_lockout("1", lockout.USER_PREFIX).is_locked
    assert not svc.check_lockout("2", lockout.USER_PREFIX).is_locked


def test_password_and_mfa_failures_do_not_share_a_budget():
    svc = _service()
    for _ in range(5):
        svc.record_failed_attempt("1", lockout.MFA_PREFIX)
    assert svc.check_lockout("1", lockout.MFA_PREFIX).is_locked
    assert not svc.check_lockout("1", lockout.USER_PREFIX).is_locked


def test_an_ip_tolerates_a_classroom_of_typos():
    """Una clase entera sale por una IP (NAT): 5-10 errores no la dejan fuera."""
    svc = _service()
    for _ in range(25):
        status = svc.record_failed_attempt("203.0.113.9", lockout.IP_PREFIX)
    assert not status.is_locked
    for _ in range(10):
        status = svc.record_failed_attempt("203.0.113.9", lockout.IP_PREFIX)
    assert status.is_locked


def test_clearing_forgets_the_failures_and_the_lock():
    svc = _service()
    for _ in range(5):
        svc.record_failed_attempt("42", lockout.USER_PREFIX)
    svc.clear_lockout("42", lockout.USER_PREFIX)
    status = svc.check_lockout("42", lockout.USER_PREFIX)
    assert not status.is_locked and status.attempts == 0


def test_login_is_refused_while_the_account_is_locked(client, db):
    make_user(db, "locked@test.com", UserRole.student)
    for _ in range(5):
        res = client.post(
            "/auth/login", data={"username": "locked@test.com", "password": "nope-nope"}
        )
        assert res.status_code == 401
        clear_route_limits()  # el tope por minuto del middleware no es lo que se prueba
    res = client.post(
        "/auth/login", data={"username": "locked@test.com", "password": "secret123"}
    )
    assert res.status_code == 429
    assert res.json()["detail"]["code"] == "account_locked"


def test_a_successful_login_forgets_earlier_failures(client, db):
    make_user(db, "ok@test.com", UserRole.student)
    for _ in range(3):
        client.post("/auth/login", data={"username": "ok@test.com", "password": "bad-bad-bad"})
    clear_route_limits()
    assert (
        client.post(
            "/auth/login", data={"username": "ok@test.com", "password": "secret123"}
        ).status_code
        == 200
    )
    user_id = db.scalar(select(User.id).where(User.email == "ok@test.com"))
    assert lockout.check_user_lockout(user_id).attempts == 0
