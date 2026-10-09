"""correlativos de matrícula y comprobante por academia y año

Los códigos salían de dos secuencias de Postgres compartidas por toda la
instalación: la serie de cada academia tenía huecos y dejaba ver el volumen de
las demás. Ahora cada academia numera los suyos en `document_counters`.

Los contadores se siembran con el número más alto ya emitido por cada academia
en cada año, para que lo nuevo no repita lo existente. Los códigos dejan de ser
únicos en toda la instalación (dos academias pueden tener su 2026-00001).
Las secuencias antiguas se conservan para poder volver atrás.

Revision ID: c2d3e4f5a6b7
Revises: b1c2d3e4f5a6
Create Date: 2026-10-07 00:00:01.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c2d3e4f5a6b7"
down_revision: Union[str, None] = "b1c2d3e4f5a6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "document_counters",
        sa.Column("tenant_key", sa.Integer(), primary_key=True),
        sa.Column("kind", sa.String(32), primary_key=True),
        sa.Column("year", sa.Integer(), primary_key=True),
        sa.Column("value", sa.Integer(), nullable=False, server_default="0"),
    )

    # "2026-00042" → año 2026, número 42. Sólo los códigos con esa forma.
    op.execute(
        r"""
        INSERT INTO document_counters (tenant_key, kind, year, value)
        SELECT coalesce(c.tenant_id, 0), 'enrollment',
               split_part(e.enrollment_code, '-', 1)::int,
               max(split_part(e.enrollment_code, '-', 2)::int)
        FROM enrollments e
        JOIN courses c ON c.id = e.course_id
        WHERE e.enrollment_code ~ '^\d{4}-\d+$'
        GROUP BY 1, 3
        """
    )
    # "FAC-2026-00042" → año 2026, número 42.
    op.execute(
        r"""
        INSERT INTO document_counters (tenant_key, kind, year, value)
        SELECT coalesce(c.tenant_id, 0), 'invoice',
               split_part(i.code, '-', 2)::int,
               max(split_part(i.code, '-', 3)::int)
        FROM invoices i
        JOIN enrollments e ON e.id = i.enrollment_id
        JOIN courses c ON c.id = e.course_id
        WHERE i.code ~ '^FAC-\d{4}-\d+$'
        GROUP BY 1, 3
        """
    )

    op.drop_index("ix_enrollments_enrollment_code", table_name="enrollments")
    op.create_index(
        "ix_enrollments_enrollment_code", "enrollments", ["enrollment_code"]
    )
    op.drop_index("ix_invoices_code", table_name="invoices")
    op.create_index("ix_invoices_code", "invoices", ["code"])


def downgrade() -> None:
    # Volver a exigir unicidad global sólo es posible si no se repitió ningún
    # código entre academias mientras rigió la numeración por academia.
    op.drop_index("ix_invoices_code", table_name="invoices")
    op.create_index("ix_invoices_code", "invoices", ["code"], unique=True)
    op.drop_index("ix_enrollments_enrollment_code", table_name="enrollments")
    op.create_index(
        "ix_enrollments_enrollment_code", "enrollments", ["enrollment_code"], unique=True
    )
    op.drop_table("document_counters")
