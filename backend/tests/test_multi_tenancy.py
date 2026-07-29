from app.models import Tenant, UserRole
from app.core.security import hash_password
from app.models.user import User


def test_create_and_list_tenants_as_superadmin(client, db):
    superadmin = User(
        email="superadmin_test@educa.com",
        full_name="Super Admin",
        role=UserRole.superadmin,
        password_hash=hash_password("pass123"),
        tenant_id=None,
    )
    db.add(superadmin)
    db.flush()

    res_login = client.post(
        "/auth/login",
        data={"username": "superadmin_test@educa.com", "password": "pass123"},
    )
    assert res_login.status_code == 200
    token = res_login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Create new tenant
    res_create = client.post(
        "/tenants",
        json={
            "name": "Academia Internacional",
            "slug": "internacional",
            "max_active_students": 50,
        },
        headers=headers,
    )
    assert res_create.status_code == 201
    tenant_data = res_create.json()
    assert tenant_data["name"] == "Academia Internacional"
    assert tenant_data["slug"] == "internacional"
    assert tenant_data["max_active_students"] == 50

    # List tenants
    res_list = client.get("/tenants", headers=headers)
    assert res_list.status_code == 200
    slugs = [t["slug"] for t in res_list.json()]
    assert "internacional" in slugs


def test_regular_admin_cannot_access_tenants_router(client, db):
    tenant = Tenant(name="Academia Regular", slug="regular", max_active_students=10)
    db.add(tenant)
    db.flush()

    admin = User(
        email="admin_reg@educa.com",
        full_name="Admin Regular",
        role=UserRole.admin,
        password_hash=hash_password("pass123"),
        tenant_id=tenant.id,
    )
    db.add(admin)
    db.flush()

    res_login = client.post(
        "/auth/login",
        data={"username": "admin_reg@educa.com", "password": "pass123"},
    )
    assert res_login.status_code == 200
    headers = {"Authorization": f"Bearer {res_login.json()['access_token']}"}

    res = client.get("/tenants", headers=headers)
    assert res.status_code == 403
