"""Cache-Control on cacheable GETs: `private` on authenticated ones."""

from tests.conftest import auth


def test_catalog_response_is_marked_private(client, world):
    admin = auth(client, "admin@test.com")
    res = client.get("/catalog/courses", headers=admin)
    assert res.status_code == 200
    cache_control = res.headers["cache-control"]
    assert "private" in cache_control
    assert "max-age=30" in cache_control


def test_schedules_response_is_marked_private(client, world):
    admin = auth(client, "admin@test.com")
    res = client.get("/schedules", headers=admin)
    assert res.status_code == 200
    assert "private" in res.headers["cache-control"]


def test_health_is_public_and_not_marked_private(client):
    res = client.get("/health")
    assert res.status_code == 200
    assert "private" not in res.headers["cache-control"]
