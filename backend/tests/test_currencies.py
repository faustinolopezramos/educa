"""La moneda de la academia: la elige su director al crearla.

Antes todo importe se mostraba en quetzales, escrito a mano en cada pantalla
(y la nómina en dólares), aunque la academia cobrara en otra moneda.
"""

from decimal import Decimal

from app.core.security import hash_password
from app.models import Tenant, User, UserRole
from app.services.currencies import format_money
from app.services.invoice_pdf import _pdf_money
from tests.conftest import auth

_ACADEMY = {
    "academy_name": "Academia Moneda",
    "slug": "academia-moneda",
    "admin_name": "Directora",
    "admin_email": "directora@moneda.com",
    "password": "Password123!",
        "accept_terms": True,
}


def test_the_director_chooses_the_currency_when_creating_the_academy(client, db):
    res = client.post("/auth/register-academy", json={**_ACADEMY, "currency": "usd"})
    assert res.status_code == 201, res.text
    assert db.query(Tenant).filter_by(slug="academia-moneda").one().currency == "USD"
    # El usuario lleva la moneda de su academia, para formatear los importes.
    assert res.json()["user"]["tenant_currency"] == "USD"
    me = client.get(
        "/auth/me", headers={"Authorization": f"Bearer {res.json()['access_token']}"}
    )
    assert me.json()["tenant_currency"] == "USD"


def test_quetzales_unless_the_director_says_otherwise(client, db):
    res = client.post("/auth/register-academy", json=_ACADEMY)
    assert res.status_code == 201, res.text
    assert db.query(Tenant).filter_by(slug="academia-moneda").one().currency == "GTQ"


def test_an_unknown_currency_is_refused(client):
    res = client.post("/auth/register-academy", json={**_ACADEMY, "currency": "BTC"})
    assert res.status_code == 422


def test_the_superadmin_can_only_set_a_known_currency(client, db):
    tenant = Tenant(name="T", slug="t-moneda", max_active_students=15)
    db.add(tenant)
    db.flush()
    root = User(
        email="root@educa.com", full_name="Root", role=UserRole.superadmin,
        password_hash=hash_password("secret123"),
    )
    db.add(root)
    db.flush()
    headers = auth(client, "root@educa.com")

    assert client.patch(f"/tenants/{tenant.id}", json={"currency": "XYZ"}, headers=headers).status_code == 422
    res = client.patch(f"/tenants/{tenant.id}", json={"currency": "mxn"}, headers=headers)
    assert res.status_code == 200, res.text
    assert res.json()["currency"] == "MXN"


def test_money_is_written_with_the_academy_symbol():
    assert format_money(Decimal("1250"), "GTQ") == "Q1,250.00"
    assert format_money(Decimal("1250"), "USD") == "$1,250.00"
    assert format_money(Decimal("99.5"), "EUR") == "€99.50"


def test_the_pdf_falls_back_to_the_code_when_its_font_lacks_the_symbol():
    assert _pdf_money(Decimal("1250"), "GTQ") == "Q1,250.00"
    assert _pdf_money(Decimal("1250"), "EUR") == "€1,250.00"
    # Helvetica no tiene "₡".
    assert _pdf_money(Decimal("1250"), "CRC") == "CRC 1,250.00"
