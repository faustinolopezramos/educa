"""canonical, unique cui_passport per tenant

La identificación personal sólo sirve para lo único que se le pide —identificar
sin repetirse— si "el mismo documento" tiene una sola respuesta. Se guardaba tal
como se tecleaba, y el índice era `unique=False`, así que `2450 12345 0101`,
`2450-12345-0101` y `2450123450101` convivían como tres personas distintas, y la
comprobación de duplicados en Python era además una carrera entre dos altas
simultáneas.

Esta migración hace dos cosas: normaliza lo ya guardado a la forma canónica
(sólo alfanuméricos, en mayúsculas) y añade el índice único parcial por
(tenant_id, cui_passport) que la aplicación creía tener.

Revision ID: f5a6b7c8d9e0
Revises: d4e5f6a7b8c9
"""

from alembic import op
import sqlalchemy as sa

revision = "f5a6b7c8d9e0"
down_revision = "d4e5f6a7b8c9"
branch_labels = None
depends_on = None

# `regexp_replace` con la bandera 'g' quita todo lo que no sea alfanumérico; el
# resultado en mayúsculas es exactamente `normalize_cui_passport` del backend.
_CANONICALIZE = """
    UPDATE users
       SET cui_passport = UPPER(REGEXP_REPLACE(cui_passport, '[^a-zA-Z0-9]', '', 'g'))
     WHERE cui_passport IS NOT NULL
"""

# Un documento en blanco tras normalizar no era una identidad, era ruido.
_BLANK_TO_NULL = "UPDATE users SET cui_passport = NULL WHERE cui_passport = ''"


def upgrade() -> None:
    op.execute(_CANONICALIZE)
    op.execute(_BLANK_TO_NULL)

    # Parcial sobre NOT NULL: el campo sigue siendo opcional para las cuentas
    # que ya existían sin él, y varias filas sin documento no chocan entre sí.
    op.create_index(
        "uq_users_tenant_cui_passport",
        "users",
        ["tenant_id", "cui_passport"],
        unique=True,
        postgresql_where=sa.text("cui_passport IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_users_tenant_cui_passport", table_name="users")
    # La normalización no se revierte: no se guardó la puntuación original, y
    # reintroducirla sólo devolvería la ambigüedad que esto vino a quitar.
