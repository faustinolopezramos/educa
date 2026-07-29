from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_role
from app.models import Tenant, UserRole
from app.schemas.tenant import TenantCreate, TenantRead, TenantUpdate

router = APIRouter(prefix="/tenants", tags=["tenants"])


@router.get("", response_model=list[TenantRead])
def list_tenants(
    db: Session = Depends(get_db),
    _: None = Depends(require_role(UserRole.superadmin)),
) -> list[Tenant]:
    return list(db.scalars(select(Tenant).order_by(Tenant.name)).all())


@router.post("", response_model=TenantRead, status_code=status.HTTP_201_CREATED)
def create_tenant(
    payload: TenantCreate,
    db: Session = Depends(get_db),
    _: None = Depends(require_role(UserRole.superadmin)),
) -> Tenant:
    existing = db.scalar(select(Tenant).where(Tenant.slug == payload.slug))
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya existe una institución con este slug",
        )
    tenant = Tenant(**payload.model_dump())
    db.add(tenant)
    db.commit()
    db.refresh(tenant)
    return tenant


@router.get("/{tenant_id}", response_model=TenantRead)
def get_tenant(
    tenant_id: int,
    db: Session = Depends(get_db),
    _: None = Depends(require_role(UserRole.superadmin)),
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
    _: None = Depends(require_role(UserRole.superadmin)),
) -> Tenant:
    tenant = db.get(Tenant, tenant_id)
    if tenant is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Institución no encontrada"
        )
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
    db.commit()
    db.refresh(tenant)
    return tenant
