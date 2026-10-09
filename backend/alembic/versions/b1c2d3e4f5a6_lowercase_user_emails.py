"""correos de usuario en minúsculas, únicos sin distinguir mayúsculas

El login comparaba el correo tal cual y el alta manual lo guardaba con las
mayúsculas que se escribieran, mientras la importación y el registro lo pasaban
a minúsculas. Resultado: "Ana.Perez@…" no entraba escribiendo "ana.perez@…", y
una importación podía dar de alta a la misma persona dos veces.

Antes de tocar nada se buscan las cuentas que chocarían al normalizar (mismo
correo salvo mayúsculas en la misma academia). Si las hay, la migración se
detiene y las lista: decidir cuál conservar es cosa de la academia, no de una
migración.

Revision ID: b1c2d3e4f5a6
Revises: a7b8c9d0e1f3
Create Date: 2026-10-07 00:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b1c2d3e4f5a6"
down_revision: Union[str, None] = "a7b8c9d0e1f3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    clashes = conn.execute(
        sa.text(
            """
            SELECT tenant_id, lower(email) AS email, array_agg(id ORDER BY id) AS ids
            FROM users
            GROUP BY tenant_id, lower(email)
            HAVING count(*) > 1
            """
        )
    ).all()
    if clashes:
        listing = "\n".join(
            f"  academia={row.tenant_id} correo={row.email} usuarios={list(row.ids)}"
            for row in clashes
        )
        raise RuntimeError(
            "Hay cuentas con el mismo correo salvo mayúsculas en la misma academia. "
            "Unifícalas o cambia el correo de una de ellas y vuelve a migrar:\n" + listing
        )

    op.execute("UPDATE users SET email = lower(email) WHERE email <> lower(email)")
    op.drop_constraint("uq_users_tenant_email", "users", type_="unique")
    op.create_index(
        "uq_users_tenant_email",
        "users",
        ["tenant_id", sa.text("lower(email)")],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("uq_users_tenant_email", table_name="users")
    op.create_unique_constraint(
        "uq_users_tenant_email", "users", ["tenant_id", "email"]
    )
