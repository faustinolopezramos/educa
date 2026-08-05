"""cierre explícito de la lista de asistencia

`status = held` lo escribe la primera marca de asistencia, así que una lista con
3 de 30 alumnos contaba como sesión registrada: la clase había ocurrido, el
registro no. El cierre es la afirmación explícita del profesor —"esta lista está
completa"— y es lo que el reporte pasa a contar como sesión registrada.

Backfill: las sesiones que ya estaban en `held` se dan por cerradas. Sin esto,
todo el histórico ya registrado aparecería de golpe como pendiente y el reporte
del trimestre pasado cambiaría de cifras al desplegar.

Revision ID: c3d4e5f6a7b8
Revises: f5a6b7c8d9e0
"""

from alembic import op
import sqlalchemy as sa

revision = "c3d4e5f6a7b8"
down_revision = "f5a6b7c8d9e0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "class_sessions",
        sa.Column("register_closed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "class_sessions",
        sa.Column("register_closed_by", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_class_sessions_register_closed_by_users",
        "class_sessions",
        "users",
        ["register_closed_by"],
        ["id"],
        ondelete="SET NULL",
    )

    # El histórico ya registrado se da por cerrado. `register_closed_by` queda
    # nulo a propósito: no se sabe quién lo cerró, y ponerle un actor inventado
    # sería peor que decir "no consta".
    op.execute(
        """
        UPDATE class_sessions
           SET register_closed_at = NOW()
         WHERE status = 'held'
           AND register_closed_at IS NULL
        """
    )

    # Las sesiones registradas se consultan por rango de fecha y por horario;
    # el índice parcial mantiene barata la pregunta "¿cuáles faltan por cerrar?".
    op.create_index(
        "ix_class_sessions_open_register",
        "class_sessions",
        ["schedule_id", "date"],
        postgresql_where=sa.text("register_closed_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("ix_class_sessions_open_register", table_name="class_sessions")
    op.drop_constraint(
        "fk_class_sessions_register_closed_by_users",
        "class_sessions",
        type_="foreignkey",
    )
    op.drop_column("class_sessions", "register_closed_by")
    op.drop_column("class_sessions", "register_closed_at")
