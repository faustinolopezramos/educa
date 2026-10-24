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


# ---------------------------------------------------------------------------
# Las políticas, de verdad. Las pruebas de arriba sólo comprueban que se fijan
# las variables de sesión; éstas comprueban que, con ellas, un rol que *no* se
# salta RLS ve únicamente lo suyo. El rol de la aplicación sí se lo salta (es
# superusuario o `postgres`), así que se crea uno de prueba.
# ---------------------------------------------------------------------------

import pytest

from app.core.rls import connection_bypasses_rls, set_rls_context
from app.models import Course, Language, Level


@pytest.fixture
def two_academies(db):
    """Dos academias con un curso cada una, y un rol sin privilegios para leerlas."""
    can_create = db.execute(
        text("SELECT rolsuper OR rolcreaterole FROM pg_roles WHERE rolname = current_user")
    ).scalar()
    if not can_create:
        pytest.skip("hace falta poder crear un rol de prueba")

    lang = Language(name="Idioma RLS")
    db.add(lang)
    db.flush()
    level = Level(language_id=lang.id, code="R1", name="R1")
    db.add(level)
    a = Tenant(name="Academia A", slug="rls-a", max_active_students=10)
    b = Tenant(name="Academia B", slug="rls-b", max_active_students=10)
    db.add_all([a, b])
    db.flush()
    ca = Course(tenant_id=a.id, level_id=level.id, name="Curso A", max_students=5)
    cb = Course(tenant_id=b.id, level_id=level.id, name="Curso B", max_students=5)
    db.add_all([ca, cb])
    db.flush()

    db.execute(text("CREATE ROLE rls_probe NOLOGIN NOBYPASSRLS"))
    db.execute(text("GRANT USAGE ON SCHEMA public TO rls_probe"))
    db.execute(text("GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO rls_probe"))
    db.execute(text("SET LOCAL ROLE rls_probe"))
    yield a, b, ca, cb
    db.execute(text("RESET ROLE"))


def _visible_courses(db):
    return {c for (c,) in db.execute(text("SELECT name FROM courses")).all()}


def test_a_tenant_sees_only_its_own_courses(db, two_academies):
    a, b, *_ = two_academies
    set_rls_context(db, tenant_id=a.id, user_id=None, superadmin=False)
    assert _visible_courses(db) == {"Curso A"}
    set_rls_context(db, tenant_id=b.id, user_id=None, superadmin=False)
    assert _visible_courses(db) == {"Curso B"}


def test_without_context_nothing_is_visible(db, two_academies):
    """Sin contexto el resultado es vacío, no «todo»: falla cerrado."""
    set_rls_context(db, tenant_id=None, user_id=None, superadmin=False)
    assert _visible_courses(db) == set()


def test_a_superadmin_sees_every_academy(db, two_academies):
    set_rls_context(db, tenant_id=None, user_id=None, superadmin=True)
    assert _visible_courses(db) == {"Curso A", "Curso B"}


def test_a_tenant_cannot_write_into_another(db, two_academies):
    from sqlalchemy.exc import DBAPIError

    a, b, *_ = two_academies
    set_rls_context(db, tenant_id=a.id, user_id=None, superadmin=False)
    # En un savepoint: el error aborta la transacción y el teardown tiene que
    # poder devolver el rol (`RESET ROLE`).
    with pytest.raises(DBAPIError):
        with db.begin_nested():
            db.execute(
                text(
                    "INSERT INTO courses (tenant_id, level_id, name, max_students, status) "
                    "SELECT :tid, level_id, 'Intruso', 5, 'draft' FROM courses LIMIT 1"
                ),
                {"tid": b.id},
            )


def test_the_context_survives_a_commit(db, two_academies):
    """`set_config(..., true)` muere con la transacción; el contexto no debe."""
    a, *_ = two_academies
    set_rls_context(db, tenant_id=a.id, user_id=None, superadmin=False)
    assert _visible_courses(db) == {"Curso A"}
    db.commit()
    assert _visible_courses(db) == {"Curso A"}


def test_the_test_database_role_is_reported_as_bypassing(db):
    """El rol de las pruebas (superusuario) se salta RLS, y la API lo sabe decir."""
    assert connection_bypasses_rls(db) is True
