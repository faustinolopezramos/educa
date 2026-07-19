"""In-app notifications: read your own, mark them read, and raise at-risk alerts."""

from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user, require_role
from app.models import Notification, User, UserRole
from app.schemas.notification import NotificationRead
from app.services.notifications import notify_teacher_of_at_risk
from app.services.reports import build_report

router = APIRouter(prefix="/notifications", tags=["notifications"])

staff_only = require_role(UserRole.admin, UserRole.teacher)


@router.get("", response_model=list[NotificationRead])
def list_notifications(
    unread_only: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[Notification]:
    """The caller's own notifications, newest first."""
    stmt = select(Notification).where(Notification.recipient_id == current_user.id)
    if unread_only:
        stmt = stmt.where(Notification.read_at.is_(None))
    return list(db.scalars(stmt.order_by(Notification.id.desc()).limit(100)).all())


@router.get("/unread-count")
def unread_count(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, int]:
    count = db.scalar(
        select(func.count())
        .select_from(Notification)
        .where(
            Notification.recipient_id == current_user.id,
            Notification.read_at.is_(None),
        )
    )
    return {"count": count or 0}


@router.post("/{notification_id}/read", response_model=NotificationRead)
def mark_read(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Notification:
    note = db.get(Notification, notification_id)
    # 404 (not 403) for someone else's notification: don't confirm it exists.
    if note is None or note.recipient_id != current_user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Notification not found")
    if note.read_at is None:
        note.read_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(note)
    return note


@router.post("/read-all", status_code=status.HTTP_204_NO_CONTENT)
def mark_all_read(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    db.execute(
        update(Notification)
        .where(
            Notification.recipient_id == current_user.id,
            Notification.read_at.is_(None),
        )
        .values(read_at=datetime.now(timezone.utc))
    )
    db.commit()


@router.post("/alerts/at-risk")
def raise_at_risk_alerts(
    period: str = Query(default="month", pattern="^(day|week|month)$"),
    anchor: date | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(staff_only),
) -> dict[str, int]:
    """Compute the period's at-risk students (in the caller's scope) and notify
    the teachers of the affected courses. Returns how many alerts were sent."""
    report = build_report(db, current_user, period, anchor or date.today())
    by_course: dict[int, list[str]] = {}
    for r in report.at_risk:
        by_course.setdefault(r.course_id, []).append(
            f"{r.student_name} ({', '.join(r.reasons)})"
        )
    created = notify_teacher_of_at_risk(db, by_course)
    db.commit()
    return {"alerts": created}
