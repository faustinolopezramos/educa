"""tenant scoping for languages, rooms, holidays and audit log

Most tables reach their academy by joining through `courses` or `users`, which
already carry `tenant_id`. These four have no such path — a room belongs to no
course, an audit row's actor may since have been deleted — so they carry their
own.

Two global unique constraints also have to become per-tenant: with one catalog
per academy, the first tenant to create "Inglés" (or to mark 15 September a
holiday) would otherwise take that name/date away from every other tenant.

Existing rows predate multi-tenancy and are all NULL. They are backfilled onto a
single default academy so one deployment's data stays coherent and visible;
`tenant_id` stays nullable because a superadmin is deliberately tenant-less.

Revision ID: 4d928cc21a5c
Revises: e7f8a9b0c1d2
Create Date: 2026-07-28 22:10:51.303461
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "4d928cc21a5c"
down_revision: Union[str, None] = "e7f8a9b0c1d2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Tables whose pre-existing rows get adopted by the default academy.
_BACKFILLED = ("languages", "rooms", "academic_holidays", "courses", "assignments")


def upgrade() -> None:
    op.add_column(
        "academic_holidays", sa.Column("tenant_id", sa.Integer(), nullable=True)
    )
    op.drop_index("ix_academic_holidays_date", table_name="academic_holidays")
    op.create_index(
        op.f("ix_academic_holidays_date"), "academic_holidays", ["date"], unique=False
    )
    op.create_index(
        op.f("ix_academic_holidays_tenant_id"),
        "academic_holidays",
        ["tenant_id"],
        unique=False,
    )
    op.create_unique_constraint(
        "uq_holidays_tenant_date",
        "academic_holidays",
        ["tenant_id", "date"],
        postgresql_nulls_not_distinct=True,
    )
    op.create_foreign_key(
        "fk_academic_holidays_tenant",
        "academic_holidays",
        "tenants",
        ["tenant_id"],
        ["id"],
        ondelete="CASCADE",
    )

    op.add_column("audit_log", sa.Column("tenant_id", sa.Integer(), nullable=True))
    op.create_index(
        op.f("ix_audit_log_tenant_id"), "audit_log", ["tenant_id"], unique=False
    )
    op.create_foreign_key(
        "fk_audit_log_tenant",
        "audit_log",
        "tenants",
        ["tenant_id"],
        ["id"],
        ondelete="CASCADE",
    )

    op.add_column("languages", sa.Column("tenant_id", sa.Integer(), nullable=True))
    op.drop_constraint("languages_name_key", "languages", type_="unique")
    op.create_index(
        op.f("ix_languages_tenant_id"), "languages", ["tenant_id"], unique=False
    )
    op.create_unique_constraint(
        "uq_languages_tenant_name",
        "languages",
        ["tenant_id", "name"],
        postgresql_nulls_not_distinct=True,
    )
    op.create_foreign_key(
        "fk_languages_tenant",
        "languages",
        "tenants",
        ["tenant_id"],
        ["id"],
        ondelete="CASCADE",
    )

    op.add_column("rooms", sa.Column("tenant_id", sa.Integer(), nullable=True))
    op.create_index(op.f("ix_rooms_tenant_id"), "rooms", ["tenant_id"], unique=False)
    op.create_foreign_key(
        "fk_rooms_tenant", "rooms", "tenants", ["tenant_id"], ["id"], ondelete="CASCADE"
    )

    _backfill_default_tenant()


def _backfill_default_tenant() -> None:
    """Adopt every pre-multi-tenancy row into one default academy.

    Skipped entirely on a database that has no data yet (a fresh install or the
    test database), so it never invents a tenant nobody asked for.

    `role::text` rather than a bare `'superadmin'` literal: at this point in the
    chain the `user_role` enum does not carry that label yet (`6b2c3d4e5f6a`
    adds it), so comparing as an enum would fail outright. Casting the column to
    text keeps this backfill independent of which labels exist when it runs.
    """
    conn = op.get_bind()

    has_data = conn.execute(
        sa.text(
            "SELECT EXISTS (SELECT 1 FROM users WHERE tenant_id IS NULL "
            "AND role::text <> 'superadmin')"
        )
    ).scalar()
    if not has_data:
        return

    tenant_id = conn.execute(
        sa.text("SELECT id FROM tenants ORDER BY id LIMIT 1")
    ).scalar()
    if tenant_id is None:
        tenant_id = conn.execute(
            sa.text(
                "INSERT INTO tenants (name, slug, is_active, max_active_students, "
                "created_at, updated_at) "
                "VALUES ('Academia', 'academia', true, 100, now(), now()) "
                "RETURNING id"
            )
        ).scalar()

    for table in _BACKFILLED:
        conn.execute(
            sa.text(f"UPDATE {table} SET tenant_id = :t WHERE tenant_id IS NULL"),
            {"t": tenant_id},
        )
    # A superadmin is deliberately tenant-less — it operates across academies —
    # so it is the one account left alone here.
    conn.execute(
        sa.text(
            "UPDATE users SET tenant_id = :t "
            "WHERE tenant_id IS NULL AND role::text <> 'superadmin'"
        ),
        {"t": tenant_id},
    )
    conn.execute(
        sa.text(
            "UPDATE audit_log SET tenant_id = :t WHERE tenant_id IS NULL "
            "AND actor_id IS NOT NULL"
        ),
        {"t": tenant_id},
    )


def downgrade() -> None:
    op.drop_constraint("fk_rooms_tenant", "rooms", type_="foreignkey")
    op.drop_index(op.f("ix_rooms_tenant_id"), table_name="rooms")
    op.drop_column("rooms", "tenant_id")

    op.drop_constraint("fk_languages_tenant", "languages", type_="foreignkey")
    op.drop_constraint("uq_languages_tenant_name", "languages", type_="unique")
    op.drop_index(op.f("ix_languages_tenant_id"), table_name="languages")
    op.create_unique_constraint("languages_name_key", "languages", ["name"])
    op.drop_column("languages", "tenant_id")

    op.drop_constraint("fk_audit_log_tenant", "audit_log", type_="foreignkey")
    op.drop_index(op.f("ix_audit_log_tenant_id"), table_name="audit_log")
    op.drop_column("audit_log", "tenant_id")

    op.drop_constraint(
        "fk_academic_holidays_tenant", "academic_holidays", type_="foreignkey"
    )
    op.drop_constraint("uq_holidays_tenant_date", "academic_holidays", type_="unique")
    op.drop_index(
        op.f("ix_academic_holidays_tenant_id"), table_name="academic_holidays"
    )
    op.drop_index(op.f("ix_academic_holidays_date"), table_name="academic_holidays")
    op.create_index(
        "ix_academic_holidays_date", "academic_holidays", ["date"], unique=True
    )
    op.drop_column("academic_holidays", "tenant_id")
