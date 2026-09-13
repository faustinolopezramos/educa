"""merge_heads

Revision ID: 9eb89e990fbb
Revises: gist_class_session_cons, d5e6f7a8b9c0
Create Date: 2026-09-11 20:18:16.268858
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9eb89e990fbb'
down_revision: Union[str, None] = ('gist_class_session_cons', 'd5e6f7a8b9c0')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
