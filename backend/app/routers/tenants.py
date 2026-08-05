from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user, require_role
from app.models import Tenant, User, UserRole
from app.schemas.tenant import TenantCreate, TenantRead, TenantUpdate
from app.services.audit import record, snapshot

router = APIRouter(prefix="/tenants", tags=["tenants"])

# Administrar academias es del superadministrador y de nadie más.
_superadmin = require_role(UserRole.superadmin)

# Los writes de este módulo se auditan como todo lo demás. Eran los únicos que
# no dejaban traza, y son justo los que fijan el límite comercial de cada
# academia (`max_active_students`) y su identidad: una nota de un examen se
# auditaba, y dar de alta una institución o subirle el cupo contratado, no.


@router.get("", response_model=list[TenantRead])
def list_tenants(
    db: Session = Depends(get_db),
    _: None = Depends(_superadmin),
) -> list[Tenant]:
    return list(db.scalars(select(Tenant).order_by(Tenant.name)).all())


@router.post("", response_model=TenantRead, status_code=status.HTTP_201_CREATED)
def create_tenant(
    payload: TenantCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = Depends(_superadmin),
) -> Tenant:
    existing = db.scalar(select(Tenant).where(Tenant.slug == payload.slug))
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya existe una institución con este slug",
        )
    tenant = Tenant(**payload.model_dump())
    db.add(tenant)
    db.flush()
    record(db, current_user, "create", "tenant", tenant.id, after=snapshot(tenant))
    db.commit()
    db.refresh(tenant)
    return tenant


@router.get("/{tenant_id}", response_model=TenantRead)
def get_tenant(
    tenant_id: int,
    db: Session = Depends(get_db),
    _: None = Depends(_superadmin),
) -> Tenant:
    tenant = db.get(Tenant, tenant_id)
    if tenant is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Institución no encontrada"
        )
    return tenant


@router.patch("/{tenant_id}", response_model=TenantRead)
def update_tenant(
    tenant_id: int,
    payload: TenantUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = Depends(_superadmin),
) -> Tenant:
    tenant = db.get(Tenant, tenant_id)
    if tenant is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Institución no encontrada"
        )
    before = snapshot(tenant)
    data = payload.model_dump(exclude_unset=True)
    if "slug" in data and data["slug"] != tenant.slug:
        existing = db.scalar(select(Tenant).where(Tenant.slug == data["slug"]))
        if existing is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Ya existe una institución con este slug",
            )
    for field, value in data.items():
        setattr(tenant, field, value)
    record(
        db, current_user, "update", "tenant", tenant.id, before, snapshot(tenant)
    )
    db.commit()
    db.refresh(tenant)
    return tenant
