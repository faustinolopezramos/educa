"""estado de matrícula: «Certificado» pasa a ser «Graduado»

Educa ya no emite certificados (la tabla se eliminó en
`drop_certificates_table`), pero el estado final de una matrícula aprobada
seguía llamándose `certified`. Significa lo mismo que antes —terminó el curso y
lo aprobó—, así que sólo cambia el nombre. `RENAME VALUE` conserva las filas
existentes sin reescribirlas.

Revision ID: d4e5f6a7b8c0
Revises: c3d4e5f6a7b9
Create Date: 2026-09-24 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op

revision: str = "d4e5f6a7b8c0"
down_revision: Union[str, None] = "c3d4e5f6a7b9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE enrollment_status RENAME VALUE 'certified' TO 'graduated'")


def downgrade() -> None:
    op.execute("ALTER TYPE enrollment_status RENAME VALUE 'graduated' TO 'certified'")
