"""auditoría: quitar los secretos MFA que se copiaron en claro

`snapshot()` no ocultaba `mfa_secret` ni `mfa_backup_codes`, así que cada edición
o baja de una cuenta con MFA dejó la semilla TOTP en `audit_log.before/after`,
que `GET /audit` entrega a los administradores. Se tapan aquí las filas ya
escritas; las nuevas ya salen redactadas.

Esto no devuelve el secreto a su dueño: quien pudo leerlo antes pudo copiarlo.
Las cuentas que tuvieron MFA activo deben volver a configurarlo.

Revision ID: e40209ef8d8d
Revises: b8c9d0e1f2a3
Create Date: 2026-10-22 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op

revision: str = "e40209ef8d8d"
down_revision: Union[str, None] = "b8c9d0e1f2a3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_KEYS = ("mfa_secret", "mfa_backup_codes")


def scrub_statements() -> list[str]:
    """Las sentencias que tapan los secretos (aparte para poder probarlas)."""
    return [
        f"""
        UPDATE audit_log
        SET {column} = jsonb_set({column}, '{{{key}}}', '"***"')
        WHERE {column} IS NOT NULL
          AND jsonb_typeof({column}) = 'object'
          AND jsonb_exists({column}, '{key}')
          AND {column} -> '{key}' <> 'null'::jsonb
          AND {column} -> '{key}' <> '"***"'::jsonb
        """
        for column in ("before", "after")
        for key in _KEYS
    ]


def upgrade() -> None:
    for statement in scrub_statements():
        op.execute(statement)


def downgrade() -> None:
    # Un secreto borrado no se puede restaurar, ni debería.
    pass
