"""El plan de la propia academia, visto por su administrador.

Separado de `/tenants`, que es la gestión de la plataforma y sólo atiende al
superadmin. Aquí la academia siempre es la del usuario que llama, nunca una que
él indique.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_role
from app.models import Tenant, User, UserRole
from app.schemas.plan import AcademyPlanRead, PlanRead, PlanRequestCreate
from app.services import tenant_plans

router = APIRouter(prefix="/academy", tags=["academy"])

# El plan es una decisión comercial: la toma la dirección, no un asistente.
_admin = require_role(UserRole.admin)


def _own_tenant(db: Session, user: User) -> Tenant:
    tenant = db.get(Tenant, user.tenant_id) if user.tenant_id is not None else None
    if tenant is None:
        # Un superadmin no pertenece a ninguna academia.
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No perteneces a ninguna academia")
    return tenant


@router.get("/plans", response_model=list[PlanRead])
def list_plans() -> list[PlanRead]:
    """Los planes y sus precios. Público: los muestra la página de registro."""
    return tenant_plans.catalog()


@router.get("/plan", response_model=AcademyPlanRead)
def get_plan(
    db: Session = Depends(get_db), current_user: User = Depends(_admin)
) -> AcademyPlanRead:
    return tenant_plans.academy_plan(db, _own_tenant(db, current_user))


@router.post("/plan-request", response_model=AcademyPlanRead)
def request_plan(
    payload: PlanRequestCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(_admin),
) -> AcademyPlanRead:
    tenant = _own_tenant(db, current_user)
    tenant_plans.request_plan(db, current_user, tenant, payload.plan)
    db.commit()
    return tenant_plans.academy_plan(db, tenant)


@router.delete("/plan-request", response_model=AcademyPlanRead)
def cancel_plan_request(
    db: Session = Depends(get_db), current_user: User = Depends(_admin)
) -> AcademyPlanRead:
    tenant = _own_tenant(db, current_user)
    tenant_plans.cancel_request(db, current_user, tenant)
    db.commit()
    return tenant_plans.academy_plan(db, tenant)
