from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel


class PlanRead(BaseModel):
    code: str
    name: str
    max_students: int
    monthly_price: Decimal


class AcademyPlanRead(BaseModel):
    """El plan de la academia tal como lo ve su administrador."""

    #: El plan vigente, o None si el cupo es a medida.
    plan: str | None
    plan_name: str
    max_active_students: int
    active_students: int
    requested_plan: str | None
    plan_requested_at: datetime | None
    has_ludi_addon: bool = False
    ludi_requested: bool = False
    ludi_requested_at: datetime | None = None
    ludi_modules: list[str] = []
    #: Los precios se cobran en quetzales.
    currency: str = "GTQ"
    plans: list[PlanRead]


class PlanRequestCreate(BaseModel):
    plan: str


class PlanActivate(BaseModel):
    plan: str


class PlanRequestReject(BaseModel):
    reason: str | None = None
