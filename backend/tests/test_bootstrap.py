"""Preparar una instalación limpia sin el seed de demostración."""

import argparse

import pytest
from sqlalchemy.orm import Session

from app.bootstrap import NATIONALITIES, ensure_nationalities, ensure_superadmin
from app.cli import cmd_bootstrap
from app.models import Nationality, User, UserRole
from tests.conftest import auth


def _args(**kw):
    return argparse.Namespace(**{"email": "root@plataforma.com", "name": "Root", "reset_password": False, **kw})


def _run(db, monkeypatch, password, **kw) -> int:
    monkeypatch.setenv("EDUCA_SUPERADMIN_PASSWORD", password)
    # Same connection as the test, so the rollback at the end undoes it.
    return cmd_bootstrap(_args(**kw), session_factory=lambda: Session(bind=db.connection(), join_transaction_mode="create_savepoint"))


def test_bootstrap_creates_the_superadmin_and_the_nationalities(client, db, monkeypatch):
    assert _run(db, monkeypatch, "una-clave-larga-1") == 0
    names = {n for (n,) in db.query(Nationality.name)}
    assert set(NATIONALITIES) <= names
    root = db.query(User).filter_by(email="root@plataforma.com").one()
    assert root.role is UserRole.superadmin and root.tenant_id is None
    assert auth(client, "root@plataforma.com", "una-clave-larga-1")


def test_bootstrap_is_idempotent(db, monkeypatch):
    assert _run(db, monkeypatch, "una-clave-larga-1") == 0
    assert _run(db, monkeypatch, "otra-clave-larga-2") == 0
    assert db.query(User).filter_by(email="root@plataforma.com").count() == 1
    assert ensure_nationalities(db) == 0


@pytest.mark.parametrize("password", ["superadmin123", "corta"])
def test_published_or_weak_passwords_are_refused(db, monkeypatch, password):
    assert _run(db, monkeypatch, password) == 1
    assert db.query(User).filter_by(email="root@plataforma.com").count() == 0


def test_reset_password_locks_out_the_old_one_and_its_sessions(client, db):
    ensure_superadmin(db, email="root@plataforma.com", full_name="Root", password="clave-vieja-123")
    old_session = auth(client, "root@plataforma.com", "clave-vieja-123")
    assert client.get("/tenants", headers=old_session).status_code == 200

    outcome = ensure_superadmin(
        db, email="root@plataforma.com", full_name="Root", password="clave-nueva-456", reset_password=True
    )
    assert outcome == "password_reset"
    assert client.get("/tenants", headers=old_session).status_code == 401
    bad = client.post("/auth/login", data={"username": "root@plataforma.com", "password": "clave-vieja-123"})
    assert bad.status_code == 401
    assert auth(client, "root@plataforma.com", "clave-nueva-456")


def test_an_academy_account_is_never_promoted(db):
    from app.core.security import hash_password
    from app.models import Tenant

    tenant = Tenant(name="A", slug="a")
    db.add(tenant)
    db.flush()
    db.add(User(email="root@plataforma.com", full_name="X", role=UserRole.admin,
                password_hash=hash_password("x" * 10), tenant_id=tenant.id))
    db.flush()
    # A same-email admin inside an academy is a different account: a new,
    # tenant-less superadmin is created instead of touching theirs.
    assert ensure_superadmin(db, email="root@plataforma.com", full_name="Root", password="clave-larga-789") == "created"
    assert db.query(User).filter_by(email="root@plataforma.com", role=UserRole.admin).count() == 1


def test_the_demo_seed_refuses_production(monkeypatch):
    from app.core.config import settings
    from app import seed

    monkeypatch.setattr(settings, "environment", "production")
    with pytest.raises(SystemExit, match="producción"):
        seed.seed()
