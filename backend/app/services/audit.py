"""Recording an audit trail for sensitive changes.

`snapshot()` turns a model row into a JSON-safe dict; `record()` appends one
audit row inside the caller's transaction, so the audit and the change it
describes commit (or roll back) together — an audit entry can never outlive a
change that was rolled back, nor go missing for one that stuck.
"""

from __future__ import annotations

import enum
from datetime import date, datetime
from typing import Any

from sqlalchemy import inspect
from sqlalchemy.orm import Session

from app.models import AuditLog, User


# Never copy secrets into the audit trail, even to record that they changed.
_REDACTED = {"password_hash", "api_credentials_encrypted"}


def _jsonable(value: Any) -> Any:
    if isinstance(value, enum.Enum):
        return value.value
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    return value


def snapshot(obj: Any) -> dict[str, Any]:
    """A JSON-safe dict of a model row's column values, secrets redacted."""
    out: dict[str, Any] = {}
    for c in inspect(obj).mapper.column_attrs:
        if c.key in _REDACTED:
            out[c.key] = "***"
        else:
            out[c.key] = _jsonable(getattr(obj, c.key))
    return out


def record(
    db: Session,
    actor: User | None,
    action: str,
    entity: str,
    entity_id: int,
    before: dict[str, Any] | None = None,
    after: dict[str, Any] | None = None,
) -> None:
    """Append one audit row. Does not commit — the caller's commit carries it."""
    db.add(
        AuditLog(
            actor_id=actor.id if actor else None,
            action=action,
            entity=entity,
            entity_id=entity_id,
            before=before,
            after=after,
        )
    )
