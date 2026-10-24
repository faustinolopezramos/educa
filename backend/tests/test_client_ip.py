"""De dónde sale la IP con la que se cuentan los intentos."""

import pytest
from starlette.requests import Request

from app.core.config import settings
from app.core.http import client_ip


def _request(headers: dict[str, str], peer: str = "10.0.0.7") -> Request:
    return Request(
        {
            "type": "http",
            "headers": [(k.lower().encode(), v.encode()) for k, v in headers.items()],
            "client": (peer, 5000),
        }
    )


@pytest.fixture
def behind_proxy(monkeypatch):
    monkeypatch.setattr(settings, "trust_proxy_headers", True)
    monkeypatch.setattr(settings, "client_ip_header", "x-forwarded-for")
    monkeypatch.setattr(settings, "trusted_proxy_hops", 1)


def test_without_a_trusted_proxy_the_socket_address_wins(monkeypatch):
    monkeypatch.setattr(settings, "trust_proxy_headers", False)
    assert client_ip(_request({"X-Forwarded-For": "1.2.3.4"})) == "10.0.0.7"


def test_a_forged_leading_entry_is_ignored(behind_proxy):
    """El cliente escribe lo de la izquierda; el proxy añade la IP real a la derecha."""
    req = _request({"X-Forwarded-For": "6.6.6.6, 203.0.113.9"})
    assert client_ip(req) == "203.0.113.9"


def test_each_request_cannot_pick_a_fresh_identity(behind_proxy):
    first = client_ip(_request({"X-Forwarded-For": "1.1.1.1, 203.0.113.9"}))
    second = client_ip(_request({"X-Forwarded-For": "2.2.2.2, 203.0.113.9"}))
    assert first == second


def test_two_proxies_take_the_second_from_the_end(behind_proxy, monkeypatch):
    monkeypatch.setattr(settings, "trusted_proxy_hops", 2)
    req = _request({"X-Forwarded-For": "9.9.9.9, 203.0.113.9, 10.1.1.1"})
    assert client_ip(req) == "203.0.113.9"


def test_a_platform_header_is_used_as_is(behind_proxy, monkeypatch):
    monkeypatch.setattr(settings, "client_ip_header", "fly-client-ip")
    req = _request({"Fly-Client-IP": "203.0.113.9", "X-Forwarded-For": "6.6.6.6"})
    assert client_ip(req) == "203.0.113.9"


def test_a_missing_header_falls_back_to_the_socket(behind_proxy):
    assert client_ip(_request({})) == "10.0.0.7"
