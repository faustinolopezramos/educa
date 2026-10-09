"""Los planes que contrata una academia: cuántos alumnos admite y cuánto cuesta.

El único sitio donde se definen. El registro, la solicitud de cambio de plan y
la activación por el superadmin leen de aquí; los precios que muestra el
frontend en la portada (`frontend/src/lib/plans.ts`) tienen que coincidir.

Todavía no hay pasarela de pago: la academia *solicita* un plan y el
superadmin lo activa al confirmar el pago (transferencia, depósito…).
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal


@dataclass(frozen=True)
class Plan:
    code: str
    name: str
    max_students: int
    #: Precio mensual en quetzales.
    monthly_price: Decimal


FREE = "free"

PLANS: dict[str, Plan] = {
    p.code: p
    for p in (
        Plan(FREE, "Gratis", 15, Decimal("0")),
        Plan("starter", "Starter", 100, Decimal("199")),
        Plan("pro", "Profesional", 300, Decimal("499")),
        Plan("scale", "Escala", 1000, Decimal("999")),
    )
}


def plan_for_quota(max_students: int | None) -> str | None:
    """El plan cuyo cupo es exactamente ése, o None si es un cupo a medida."""
    for plan in PLANS.values():
        if plan.max_students == max_students:
            return plan.code
    return None


def plan_name(code: str | None) -> str:
    plan = PLANS.get(code or "")
    return plan.name if plan else "Personalizado"
