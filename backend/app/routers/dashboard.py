"""The caller's home screen: what is waiting on them, not how many of what."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models import User
from app.schemas.dashboard import DashboardSummaryRead
from app.services.dashboard import build_summary

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("", response_model=DashboardSummaryRead)
def get_dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DashboardSummaryRead:
    """Every role may ask; the answer is scoped to what they can act on.

    No permission gate of its own: the summary is assembled from the same checks
    the sections themselves enforce, so an assistant without `manage_finance`
    simply gets no money item rather than a 403 on their own home screen.
    """
    return DashboardSummaryRead.model_validate(build_summary(db, current_user))
