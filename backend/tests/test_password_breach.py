"""La comprobación de contraseñas filtradas, contra una respuesta simulada de HIBP."""

import hashlib

import httpx
import pytest

from app.services import password_breach as pb

pytestmark = pytest.mark.real_breach_check


def _range_body(password: str, count: int) -> str:
    suffix = hashlib.sha1(password.encode()).hexdigest().upper()[5:]
    return f"0018A45C4D1DEF81644B54AB7F969B88D65:3\r\n{suffix}:{count}\r\n"


class _Response:
    def __init__(self, status_code: int, text: str = ""):
        self.status_code = status_code
        self.text = text


def test_a_password_listed_in_a_breach_is_compromised(monkeypatch):
    monkeypatch.setattr(
        httpx, "get", lambda *a, **k: _Response(200, _range_body("Password123!", 42))
    )
    result = pb.check_password_breach_sync("Password123!")
    assert result.compromised and result.count == 42


def test_a_password_absent_from_the_range_is_not_compromised(monkeypatch):
    monkeypatch.setattr(httpx, "get", lambda *a, **k: _Response(200, "ABCDE:1\r\n"))
    assert not pb.check_password_breach_sync("correct horse battery").compromised


def test_only_the_hash_prefix_leaves_the_server(monkeypatch):
    seen = {}

    def fake_get(url, **kwargs):
        seen["url"] = url
        return _Response(200, "")

    monkeypatch.setattr(httpx, "get", fake_get)
    pb.check_password_breach_sync("Password123!")
    full = hashlib.sha1(b"Password123!").hexdigest().upper()
    assert seen["url"].endswith("/" + full[:5])
    assert full[5:] not in seen["url"]


@pytest.mark.parametrize(
    "failure",
    [httpx.ConnectError("sin red"), httpx.ReadTimeout("lento")],
)
def test_an_unreachable_service_fails_open(monkeypatch, failure):
    """Sin respuesta de HIBP no se bloquea el registro: sólo se anota el error."""

    def boom(*a, **k):
        raise failure

    monkeypatch.setattr(httpx, "get", boom)
    result = pb.check_password_breach_sync("Password123!")
    assert not result.compromised and result.error


def test_a_non_200_answer_fails_open(monkeypatch):
    monkeypatch.setattr(httpx, "get", lambda *a, **k: _Response(503))
    result = pb.check_password_breach_sync("Password123!")
    assert not result.compromised and result.error
