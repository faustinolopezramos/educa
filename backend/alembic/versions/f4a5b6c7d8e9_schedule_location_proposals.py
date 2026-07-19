"""schedule effective location + teacher location proposals

Revision ID: f4a5b6c7d8e9
Revises: e3f4a5b6c7d8
Create Date: 2026-07-16 12:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "f4a5b6c7d8e9"
down_revision: Union[str, None] = "e3f4a5b6c7d8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# create_type=False on the column-bound instances so add_column / create_table
# reference the type instead of trying to CREATE it a second time. The types are
# created once, explicitly, at the top of upgrade().
modality = postgresql.ENUM(
    "presencial", "virtual", name="modality", create_type=False
)
proposal_status = postgresql.ENUM(
    "pending", "approved", "rejected", name="proposal_status", create_type=False
)
# Already created by the meeting_providers table; reference, don't recreate.
provider_name = postgresql.ENUM(name="provider_name", create_type=False)


def upgrade() -> None:
    bind = op.get_bind()
    postgresql.ENUM("presencial", "virtual", name="modality").create(
        bind, checkfirst=True
    )
    postgresql.ENUM(
        "pending", "approved", "rejected", name="proposal_status"
    ).create(bind, checkfirst=True)

    # --- schedules: effective location ---
    op.add_column(
        "schedules",
        sa.Column(
            "modality", modality, nullable=False, server_default="presencial"
        ),
    )
    op.add_column("schedules", sa.Column("join_url", sa.Text(), nullable=True))
    op.add_column(
        "schedules", sa.Column("provider", provider_name, nullable=True)
    )

    # --- location proposals ---
    op.create_table(
        "location_proposals",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("schedule_id", sa.Integer(), nullable=False),
        sa.Column("proposed_by", sa.Integer(), nullable=False),
        sa.Column("modality", modality, nullable=False),
        sa.Column("room_id", sa.Integer(), nullable=True),
        sa.Column("provider", provider_name, nullable=True),
        sa.Column("join_url", sa.Text(), nullable=True),
        sa.Column("status", proposal_status, nullable=False),
        sa.Column("review_note", sa.Text(), nullable=True),
        sa.Column("reviewed_by", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["schedule_id"], ["schedules.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["proposed_by"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["room_id"], ["rooms.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["reviewed_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_location_proposals_schedule_id"),
        "location_proposals",
        ["schedule_id"],
    )
    op.create_index(
        op.f("ix_location_proposals_status"), "location_proposals", ["status"]
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_location_proposals_status"), table_name="location_proposals"
    )
    op.drop_index(
        op.f("ix_location_proposals_schedule_id"), table_name="location_proposals"
    )
    op.drop_table("location_proposals")

    op.drop_column("schedules", "provider")
    op.drop_column("schedules", "join_url")
    op.drop_column("schedules", "modality")

    proposal_status.drop(op.get_bind(), checkfirst=True)
    modality.drop(op.get_bind(), checkfirst=True)
