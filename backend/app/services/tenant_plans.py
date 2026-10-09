"""Pedir, activar y rechazar el plan de una academia.

Sin pasarela de pago todavía: la academia pide un plan, el superadmin confirma
el pago por su cuenta y lo activa. Cada paso queda en la auditoría y avisa a la
otra parte.
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models import Tenant, User
from app.schemas.plan import AcademyPlanRead, PlanRead
from app.services.audit import record, snapshot
from app.services.enrollments import count_tenant_active_students
from app.services.notifications import notify_superadmins, notify_tenant_admins
from app.services.plans import PLANS, Plan, plan_for_quota, plan_name


def catalog() -> list[PlanRead]:
    return [PlanRead(**vars(p)) for p in PLANS.values()]


def plan_or_422(code: str) -> Plan:
    plan = PLANS.get(code.strip().lower())
    if plan is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Ese plan no existe")
    return plan


def academy_plan(db: Session, tenant: Tenant) -> AcademyPlanRead:
    return AcademyPlanRead(
        plan=tenant.plan_tier,
        plan_name=plan_name(tenant.plan_tier),
        max_active_students=tenant.max_active_students,
        active_students=count_tenant_active_students(db, tenant.id),
        requested_plan=tenant.requested_plan,
        plan_requested_at=tenant.plan_requested_at,
        plans=catalog(),
    )


def _refuse_if_too_small(db: Session, tenant: Tenant, plan: Plan) -> None:
    """Un plan con menos plazas que alumnos activos dejaría a la academia fuera
    de su propio cupo: hay que dar de baja alumnos antes de bajar de plan."""
    active = count_tenant_active_students(db, tenant.id)
    if active > plan.max_students:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            {
                "message": (
                    f"El plan {plan.name} admite {plan.max_students} alumnos y la "
                    f"academia tiene {active} activos."
                ),
                "reason": "plan_too_small",
                "active_students": active,
            },
        )


def request_plan(db: Session, actor: User, tenant: Tenant, code: str) -> None:
    """La academia pide un plan. Sustituye a una solicitud anterior sin resolver."""
    plan = plan_or_422(code)
    if plan.code == tenant.plan_tier:
        raise HTTPException(status.HTTP_409_CONFLICT, "Ese ya es tu plan actual")
    _refuse_if_too_small(db, tenant, plan)
    before = snapshot(tenant)
    tenant.requested_plan = plan.code
    tenant.plan_requested_at = datetime.now(timezone.utc)
    record(db, actor, "request_plan", "tenant", tenant.id, before, snapshot(tenant))
    notify_superadmins(
        db,
        "plan_request",
        f"{tenant.name} solicita el plan {plan.name}",
        (
            f"La academia {tenant.name} ({tenant.slug}) pide pasar del plan "
            f"{plan_name(tenant.plan_tier)} al {plan.name} "
            f"({plan.max_students} alumnos, Q{plan.monthly_price:,.0f}/mes). "
            "Actívalo en Instituciones al confirmar el pago."
        ),
        {"tenant_id": tenant.id, "plan": plan.code},
    )


def note_registration_request(db: Session, tenant: Tenant, code: str) -> None:
    """El plan de pago elegido al registrarse queda como solicitud pendiente.

    Un nombre de plan desconocido, o el gratuito, no deja solicitud: la academia
    ya está en el gratuito.
    """
    plan = PLANS.get(code.strip().lower())
    if plan is None or plan.code == tenant.plan_tier:
        return
    tenant.requested_plan = plan.code
    tenant.plan_requested_at = datetime.now(timezone.utc)
    notify_superadmins(
        db,
        "plan_request",
        f"Nueva academia {tenant.name} solicita el plan {plan.name}",
        (
            f"{tenant.name} ({tenant.slug}) se registró y eligió el plan {plan.name} "
            f"({plan.max_students} alumnos, Q{plan.monthly_price:,.0f}/mes). Empezó en "
            "el plan gratuito; actívalo en Instituciones al confirmar el pago."
        ),
        {"tenant_id": tenant.id, "plan": plan.code},
    )


def cancel_request(db: Session, actor: User, tenant: Tenant) -> None:
    if tenant.requested_plan is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "No hay ninguna solicitud pendiente")
    before = snapshot(tenant)
    tenant.requested_plan = None
    tenant.plan_requested_at = None
    record(db, actor, "cancel_plan_req", "tenant", tenant.id, before, snapshot(tenant))


def activate_plan(db: Session, actor: User, tenant: Tenant, code: str) -> None:
    """El superadmin pone a la academia en un plan (normalmente, el que pidió)."""
    plan = plan_or_422(code)
    _refuse_if_too_small(db, tenant, plan)
    before = snapshot(tenant)
    tenant.plan_tier = plan.code
    tenant.max_active_students = plan.max_students
    tenant.requested_plan = None
    tenant.plan_requested_at = None
    record(db, actor, "activate_plan", "tenant", tenant.id, before, snapshot(tenant))
    notify_tenant_admins(
        db,
        tenant.id,
        "plan_activated",
        f"Tu plan {plan.name} está activo",
        f"Tu academia ya admite hasta {plan.max_students} alumnos activos.",
    )


def reject_request(db: Session, actor: User, tenant: Tenant, reason: str | None) -> None:
    if tenant.requested_plan is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "No hay ninguna solicitud pendiente")
    requested = plan_name(tenant.requested_plan)
    before = snapshot(tenant)
    tenant.requested_plan = None
    tenant.plan_requested_at = None
    record(db, actor, "reject_plan_req", "tenant", tenant.id, before, snapshot(tenant))
    body = f"No se activó el plan {requested}."
    if reason and reason.strip():
        body += f" Motivo: {reason.strip()}"
    notify_tenant_admins(db, tenant.id, "plan_rejected", f"Solicitud del plan {requested}", body)


def sync_plan_with_quota(tenant: Tenant) -> None:
    """Tras editar el cupo a mano, el plan es el que tenga ese cupo, o "a medida"."""
    tenant.plan_tier = plan_for_quota(tenant.max_active_students)
