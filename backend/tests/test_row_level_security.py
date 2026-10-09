"""Tests for database Row Level Security (RLS) and session context scoping."""

from sqlalchemy import text

from app.core.deps import get_current_user
from app.core.security import create_access_token, hash_password
from app.models import Tenant, User, UserRole


def test_rls_session_variables_configured_on_current_user(db):
    """When an authenticated user is resolved, the session receives their tenant context."""
    tenant = Tenant(name="Academia RLS", slug="rls-test", max_active_students=10)
    db.add(tenant)
    db.flush()

    user = User(
        email="admin@rls.com",
        full_name="Admin RLS",
        role=UserRole.admin,
        password_hash=hash_password("secret123"),
        tenant_id=tenant.id,
    )
    db.add(user)
    db.flush()

    token = create_access_token(str(user.id), extra={"ver": user.token_version})
    resolved = get_current_user(token=token, db=db)

    assert resolved.id == user.id
    assert resolved.tenant_id == tenant.id

    # Verify session settings can be read from postgres connection
    current_tid = db.scalar(text("SELECT NULLIF(current_setting('app.current_tenant_id', true), '')"))
    current_uid = db.scalar(text("SELECT NULLIF(current_setting('app.current_user_id', true), '')"))

    assert current_tid == str(tenant.id)
    assert current_uid == str(user.id)


def test_rls_superadmin_sets_superadmin_flag(db):
    """When a superadmin accesses the system, app.is_superadmin is set to true."""
    root = User(
        email="root@rls.com",
        full_name="Superadmin RLS",
        role=UserRole.superadmin,
        password_hash=hash_password("secret123"),
        tenant_id=None,
    )
    db.add(root)
    db.flush()

    token = create_access_token(str(root.id), extra={"ver": root.token_version})
    resolved = get_current_user(token=token, db=db)

    assert resolved.id == root.id
    assert resolved.role == UserRole.superadmin

    is_super = db.scalar(text("SELECT NULLIF(current_setting('app.is_superadmin', true), '')"))
    assert is_super == "true"


def test_rls_migration_metadata():
    """Verify that the RLS migration revision links to the current Alembic head and covers all tables."""
    import importlib.util
    from pathlib import Path

    migration_path = (
        Path(__file__).resolve().parent.parent
        / "alembic"
        / "versions"
        / "f7a8b9c0d1e2_enable_row_level_security.py"
    )
    spec = importlib.util.spec_from_file_location("rls_migration", migration_path)
    rls_migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(rls_migration)

    assert rls_migration.revision == "f7a8b9c0d1e2"
    assert rls_migration.down_revision == "e4f5a6b7c8d9"
    assert len(rls_migration.ALL_TABLES) >= 35
    assert "tenants" in rls_migration.ALL_TABLES
    assert "users" in rls_migration.ALL_TABLES
    assert "courses" in rls_migration.ALL_TABLES
    assert "payments" in rls_migration.ALL_TABLES
    assert "invoices" in rls_migration.ALL_TABLES
    assert "grades" in rls_migration.ALL_TABLES
    assert "attendance" in rls_migration.ALL_TABLES
