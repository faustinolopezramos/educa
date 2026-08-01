from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import (
    apply_tenant,
    get_current_user,
    in_tenant,
    require_permission,
)
from app.models import AcademicHoliday, Permission, User, UserRole
from app.schemas.holiday import HolidayCreate, HolidayRead
from app.services.audit import record, snapshot

router = APIRouter(prefix="/holidays", tags=["holidays"])

admin_only = require_permission(Permission.manage_catalog)


@router.get("", response_model=list[HolidayRead])
def list_holidays(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[AcademicHoliday]:
    """Readable by anyone in the academy: the closed-days calendar is not
    sensitive, but it is still *this* academy's calendar."""
    stmt = apply_tenant(
        select(AcademicHoliday), AcademicHoliday.tenant_id, current_user
    )
    return list(db.scalars(stmt.order_by(AcademicHoliday.date)).all())


@router.post("", response_model=HolidayRead, status_code=status.HTTP_201_CREATED)
def create_holiday(
    payload: HolidayCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(admin_only),
) -> AcademicHoliday:
    holiday = AcademicHoliday(
        date=payload.date, name=payload.name, tenant_id=current_user.tenant_id
    )
    db.add(holiday)
    db.flush()
    # Adding or removing a closed day changes which classes get generated at
    # all, so it is as much an academic decision as a calendar one.
    record(db, current_user, "create", "holiday", holiday.id, after=snapshot(holiday))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Ya hay un festivo en esa fecha")
    db.refresh(holiday)
    return holiday


@router.delete("/{holiday_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_holiday(
    holiday_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(admin_only),
) -> None:
    holiday = db.get(AcademicHoliday, holiday_id)
    if not in_tenant(current_user, holiday):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Holiday not found")
    record(db, current_user, "delete", "holiday", holiday.id, before=snapshot(holiday))
    db.delete(holiday)
    db.commit()
