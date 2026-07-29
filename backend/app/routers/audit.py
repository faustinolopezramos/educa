from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import apply_tenant, require_role
from app.models import AuditLog, User, UserRole
from app.schemas.audit import AuditLogRead
from app.schemas.base import PaginatedResponse

router = APIRouter(prefix="/audit", tags=["audit"])

admin_only = require_role(UserRole.admin)


@router.get("", response_model=PaginatedResponse[AuditLogRead])
def list_audit(
    entity: str | None = None,
    entity_id: int | None = None,
    actor_id: int | None = None,
    offset: int = 0,
    limit: int = Query(default=100, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(admin_only),
) -> PaginatedResponse[AuditLogRead]:
    """The change trail, newest first. Admin-only — it exposes before/after data
    across the academy, and only ever the caller's own academy."""
    filters = []
    if entity is not None:
        filters.append(AuditLog.entity == entity)
    if entity_id is not None:
        filters.append(AuditLog.entity_id == entity_id)
    if actor_id is not None:
        filters.append(AuditLog.actor_id == actor_id)
    count_stmt = apply_tenant(
        select(func.count(AuditLog.id)).where(*filters),
        AuditLog.tenant_id,
        current_user,
    )
    list_stmt = apply_tenant(
        select(AuditLog).where(*filters), AuditLog.tenant_id, current_user
    )
    total = db.scalar(count_stmt) or 0
    rows = db.scalars(
        list_stmt.order_by(AuditLog.id.desc()).offset(offset).limit(limit)
    ).all()
    return PaginatedResponse(
        items=[AuditLogRead.model_validate(r) for r in rows],
        total=total,
        offset=offset,
        limit=limit,
    )
