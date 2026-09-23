from decimal import Decimal

from app.schemas.base import Money
from pydantic import BaseModel, ConfigDict


class ActionItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    kind: str
    label: str
    count: int
    #: `critical` | `warning` | `info` — the order the tray is read in.
    severity: str
    #: The `?m=` section that resolves this item, so it is never a dead end.
    section: str
    detail: str | None = None
    amount: Money | None = None


class AcademyKpisRead(BaseModel):
    """The headline numbers of an academy's operating state.

    Occupancy counts only *active* courses: a rate that included drafts and
    archives would read low for a full academy simply because somebody left a
    draft lying around.
    """

    model_config = ConfigDict(from_attributes=True)
    active_courses: int
    draft_courses: int
    total_courses: int
    active_students: int
    active_teachers: int
    seats_taken: int
    seats_offered: int
    #: None when no seats are offered — not the same as 0% and must not render
    #: as one.
    occupancy_rate: float | None


class DashboardSummaryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    role: str
    items: list[ActionItemRead]
    balance_due: Money = Decimal("0.00")
    next_session_id: int | None = None
    #: Staff only. `None` for anyone else rather than a block of zeros, which
    #: would read as "an academy with nothing in it".
    kpis: AcademyKpisRead | None = None
