"""Contexto de Row Level Security (RLS) para la sesión de base de datos.

Las políticas de RLS (migración `f7a8b9c0d1e2`) deciden por tres variables de
sesión: `app.current_tenant_id`, `app.current_user_id` y `app.is_superadmin`. La
API las fija con `set_config(..., true)`, que es *local a la transacción*: en
cuanto el endpoint hace `commit()` —y casi todos lo hacen— la variable
desaparece y la transacción siguiente corre sin contexto. Con una política en
vigor eso devolvería filas vacías sin dar error.

Por eso el contexto se guarda en `session.info` y se vuelve a aplicar al empezar
cada transacción de esa sesión (`after_begin`), no sólo una vez al autenticar.
"""

from __future__ import annotations

import logging

from sqlalchemy import event, text
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

_INFO_KEY = "rls_context"


def _statements(ctx: dict[str, str]) -> list[tuple[str, dict[str, str]]]:
    return [
        ("SELECT set_config(:name, :value, true)", {"name": name, "value": value})
        for name, value in ctx.items()
    ]


def set_rls_context(db: Session, *, tenant_id: int | None, user_id: int | None, superadmin: bool) -> None:
    """Fija el contexto de RLS de esta sesión, ahora y en cada transacción futura."""
    ctx: dict[str, str] = {}
    if tenant_id is not None:
        ctx["app.current_tenant_id"] = str(tenant_id)
    if user_id is not None:
        ctx["app.current_user_id"] = str(user_id)
    if superadmin:
        ctx["app.is_superadmin"] = "true"
    db.info[_INFO_KEY] = ctx
    try:
        for sql, params in _statements(ctx):
            db.execute(text(sql), params)
    except Exception:
        # No se traga: un contexto que no se pudo fijar es un aislamiento que
        # no está en vigor, y quien lea el log tiene que poder verlo.
        logger.exception("No se pudo fijar el contexto de RLS (usuario %s)", user_id)


@event.listens_for(Session, "after_begin")
def _reapply_rls_context(session: Session, transaction, connection) -> None:
    ctx = session.info.get(_INFO_KEY)
    if not ctx:
        return
    for sql, params in _statements(ctx):
        connection.execute(text(sql), params)


def connection_bypasses_rls(db: Session) -> bool | None:
    """Si el rol con el que conecta la API se salta las políticas de RLS.

    Un superusuario, el dueño de la tabla (sin `FORCE ROW LEVEL SECURITY`) o un
    rol con `BYPASSRLS` —como `postgres` en Supabase— ignoran las políticas: el
    aislamiento entre academias descansa entonces sólo en los filtros de la API.
    `None` si no se pudo averiguar.
    """
    try:
        row = db.execute(
            text("SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname = current_user")
        ).scalar()
        return bool(row) if row is not None else None
    except Exception:
        logger.warning("No se pudo comprobar si el rol se salta RLS", exc_info=True)
        return None
