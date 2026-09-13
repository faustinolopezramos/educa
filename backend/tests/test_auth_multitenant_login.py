from app.core.security import hash_password
from app.models import Tenant, User, UserRole


def test_login_single_tenant_standard(client, db):
    tenant = Tenant(name="Academia Central", slug="central", max_active_students=50)
    db.add(tenant)
    db.flush()

    user = User(
        email="solo@central.com",
        full_name="Usuario Solo",
        role=UserRole.student,
        password_hash=hash_password("clave123"),
        tenant_id=tenant.id,
    )
    db.add(user)
    db.commit()

    res = client.post(
        "/auth/login",
        data={"username": "solo@central.com", "password": "clave123"},
    )
    assert res.status_code == 200
    data = res.json()
    assert "access_token" in data
    assert data["user"]["email"] == "solo@central.com"


def test_login_multitenant_with_x_tenant_slug(client, db):
    t1 = Tenant(name="Academia Norte", slug="norte", max_active_students=50)
    t2 = Tenant(name="Academia Sur", slug="sur", max_active_students=50)
    db.add_all([t1, t2])
    db.flush()

    # Same email in both tenants, different names
    u1 = User(
        email="multi@educa.com",
        full_name="Multi Norte",
        role=UserRole.teacher,
        password_hash=hash_password("claveNorte"),
        tenant_id=t1.id,
    )
    u2 = User(
        email="multi@educa.com",
        full_name="Multi Sur",
        role=UserRole.teacher,
        password_hash=hash_password("claveSur"),
        tenant_id=t2.id,
    )
    db.add_all([u1, u2])
    db.commit()

    # Login into Norte specifying X-Tenant-Slug
    res = client.post(
        "/auth/login",
        data={"username": "multi@educa.com", "password": "claveNorte"},
        headers={"X-Tenant-Slug": "norte"},
    )
    assert res.status_code == 200
    assert res.json()["user"]["full_name"] == "Multi Norte"

    # Login into Sur specifying X-Tenant-Slug
    res = client.post(
        "/auth/login",
        data={"username": "multi@educa.com", "password": "claveSur"},
        headers={"X-Tenant-Slug": "sur"},
    )
    assert res.status_code == 200
    assert res.json()["user"]["full_name"] == "Multi Sur"

    # Login into Norte with wrong password fails 401
    res = client.post(
        "/auth/login",
        data={"username": "multi@educa.com", "password": "claveInvalida"},
        headers={"X-Tenant-Slug": "norte"},
    )
    assert res.status_code == 401


def test_login_multitenant_with_client_id_form_field(client, db):
    t1 = Tenant(name="Campus Este", slug="este", max_active_students=50)
    db.add(t1)
    db.flush()

    u1 = User(
        email="clientid@educa.com",
        full_name="Alumno Este",
        role=UserRole.student,
        password_hash=hash_password("clave123"),
        tenant_id=t1.id,
    )
    db.add(u1)
    db.commit()

    res = client.post(
        "/auth/login",
        data={
            "username": "clientid@educa.com",
            "password": "clave123",
            "client_id": "este",
        },
    )
    assert res.status_code == 200
    assert res.json()["user"]["full_name"] == "Alumno Este"


def test_login_multitenant_distinct_passwords_auto_resolves(client, db):
    t1 = Tenant(name="Alfa", slug="alfa", max_active_students=50)
    t2 = Tenant(name="Beta", slug="beta", max_active_students=50)
    db.add_all([t1, t2])
    db.flush()

    u1 = User(
        email="shared@educa.com",
        full_name="Usuario Alfa",
        role=UserRole.student,
        password_hash=hash_password("claveAlfa"),
        tenant_id=t1.id,
    )
    u2 = User(
        email="shared@educa.com",
        full_name="Usuario Beta",
        role=UserRole.student,
        password_hash=hash_password("claveBeta"),
        tenant_id=t2.id,
    )
    db.add_all([u1, u2])
    db.commit()

    # Without X-Tenant-Slug, if user enters claveAlfa, it directly logs into Alfa!
    res = client.post(
        "/auth/login",
        data={"username": "shared@educa.com", "password": "claveAlfa"},
    )
    assert res.status_code == 200
    assert res.json()["user"]["full_name"] == "Usuario Alfa"


def test_login_multitenant_same_password_prompts_tenant_required(client, db):
    t1 = Tenant(name="Sede 1", slug="sede1", max_active_students=50)
    t2 = Tenant(name="Sede 2", slug="sede2", max_active_students=50)
    db.add_all([t1, t2])
    db.flush()

    u1 = User(
        email="ambiguous@educa.com",
        full_name="Usuario Sede 1",
        role=UserRole.student,
        password_hash=hash_password("mismaClave"),
        tenant_id=t1.id,
    )
    u2 = User(
        email="ambiguous@educa.com",
        full_name="Usuario Sede 2",
        role=UserRole.student,
        password_hash=hash_password("mismaClave"),
        tenant_id=t2.id,
    )
    db.add_all([u1, u2])
    db.commit()

    # Without X-Tenant-Slug, since both accounts have mismaClave, responds 409 tenant_required
    res = client.post(
        "/auth/login",
        data={"username": "ambiguous@educa.com", "password": "mismaClave"},
    )
    assert res.status_code == 409
    detail = res.json()["detail"]
    assert detail["code"] == "tenant_required"
    slugs = [t["slug"] for t in detail["tenants"]]
    assert "sede1" in slugs
    assert "sede2" in slugs
