from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user, require_role
from app.models import AcademicHoliday, User, UserRole
from app.schemas.holiday import HolidayCreate, HolidayRead

router = APIRouter(prefix="/holidays", tags=["holidays"])

admin_only = require_role(UserRole.admin)


@router.get("", response_model=list[HolidayRead])
def list_holidays(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[AcademicHoliday]:
    """Readable by anyone: the closed-days calendar is not sensitive."""
    return list(db.scalars(select(AcademicHoliday).order_by(AcademicHoliday.date)).all())


@router.post("", response_model=HolidayRead, status_code=status.HTTP_201_CREATED)
def create_holiday(
    payload: HolidayCreate,
    db: Session = Depends(get_db),
    _: User = Depends(admin_only),
) -> AcademicHoliday:
    holiday = AcademicHoliday(date=payload.date, name=payload.name)
    db.add(holiday)
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
    _: User = Depends(admin_only),
) -> None:
    holiday = db.get(AcademicHoliday, holiday_id)
    if holiday is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Holiday not found")
    db.delete(holiday)
    db.commit()
