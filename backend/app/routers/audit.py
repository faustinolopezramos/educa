from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_role
from app.models import AuditLog, User, UserRole
from app.schemas.audit import AuditLogRead

router = APIRouter(prefix="/audit", tags=["audit"])

admin_only = require_role(UserRole.admin)


@router.get("", response_model=list[AuditLogRead])
def list_audit(
    entity: str | None = None,
    entity_id: int | None = None,
    actor_id: int | None = None,
    limit: int = Query(default=100, le=500),
    db: Session = Depends(get_db),
    _: User = Depends(admin_only),
) -> list[AuditLog]:
    """The change trail, newest first. Admin-only — it exposes before/after data
    across the academy."""
    stmt = select(AuditLog)
    if entity is not None:
        stmt = stmt.where(AuditLog.entity == entity)
    if entity_id is not None:
        stmt = stmt.where(AuditLog.entity_id == entity_id)
    if actor_id is not None:
        stmt = stmt.where(AuditLog.actor_id == actor_id)
    return list(db.scalars(stmt.order_by(AuditLog.id.desc()).limit(limit)).all())
