"""add the missing 'superadmin' label to the user_role enum

`UserRole.superadmin` exists in Python and the whole tenant feature hangs off
it — `require_role(UserRole.superadmin)` guards `/tenants`, and
`_guard_role_assignment` reserves granting the role to superadmins alone — but
no migration ever added the label to the Postgres type. `user_role` only had
admin/teacher/student.

The result on any database built from scratch: inserting a superadmin fails with
"invalid input value for enum user_role", so the account that manages academies
cannot be created at all and tenant administration is unusable. It went unseen
because developer databases were migrated incrementally from before the role
existed, where the enum had been created by other means.

`ALTER TYPE ... ADD VALUE` is allowed inside a transaction on PostgreSQL 12+ as
long as the new value is not *used* in that same transaction, which is why this
gets its own migration rather than being folded into another one.

Revision ID: 6b2c3d4e5f6a
Revises: 5a1b2c3d4e5f
Create Date: 2026-07-28 22:55:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "6b2c3d4e5f6a"
down_revision: Union[str, None] = "5a1b2c3d4e5f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'superadmin'"))


def downgrade() -> None:
    # Postgres cannot drop a value from an enum type. Removing it would mean
    # rebuilding the type and rewriting every column that uses it, which is a
    # far more destructive act than the one being undone — and any row already
    # holding 'superadmin' would have nowhere to go.
    pass
