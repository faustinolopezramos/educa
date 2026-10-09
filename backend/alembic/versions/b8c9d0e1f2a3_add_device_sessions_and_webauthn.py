"""add device_sessions and webauthn tables

Revision ID: b8c9d0e1f2a3
Revises: add_mfa_fields
Create Date: 2026-10-09 15:20:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b8c9d0e1f2a3"
down_revision: Union[str, None] = "add_mfa_fields"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. device_sessions
    op.create_table(
        "device_sessions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("refresh_jti", sa.String(length=64), nullable=False),
        sa.Column("user_agent", sa.Text(), nullable=True),
        sa.Column("ip_address", sa.String(length=45), nullable=True),
        sa.Column("device_name", sa.String(length=255), nullable=True),
        sa.Column("location", sa.String(length=255), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "last_used_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "is_current",
            sa.Boolean(),
            server_default=sa.false(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_device_sessions_user_id"),
        "device_sessions",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_device_sessions_refresh_jti"),
        "device_sessions",
        ["refresh_jti"],
        unique=True,
    )
    op.create_index(
        "ix_device_sessions_last_used",
        "device_sessions",
        ["last_used_at"],
        unique=False,
    )

    # 2. webauthn_credentials
    op.create_table(
        "webauthn_credentials",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("credential_id", sa.String(length=255), nullable=False),
        sa.Column("public_key", sa.Text(), nullable=False),
        sa.Column("sign_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("name", sa.String(length=255), nullable=True),
        sa.Column("authenticator_type", sa.String(length=50), nullable=True),
        sa.Column("transports", sa.String(length=255), nullable=True),
        sa.Column("aaguid", sa.String(length=36), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_webauthn_credentials_user_id"),
        "webauthn_credentials",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_webauthn_credentials_credential_id"),
        "webauthn_credentials",
        ["credential_id"],
        unique=True,
    )

    # 3. webauthn_challenges
    op.create_table(
        "webauthn_challenges",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("challenge", sa.String(length=255), nullable=False),
        sa.Column("challenge_type", sa.String(length=20), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("data", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_webauthn_challenges_user_id"),
        "webauthn_challenges",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_webauthn_challenges_challenge"),
        "webauthn_challenges",
        ["challenge"],
        unique=True,
    )
    op.create_index(
        "ix_webauthn_challenges_expires_at",
        "webauthn_challenges",
        ["expires_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_table("webauthn_challenges")
    op.drop_table("webauthn_credentials")
    op.drop_table("device_sessions")
