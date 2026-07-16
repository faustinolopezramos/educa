import json

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from sqlalchemy import Select

from app.core.crypto import encrypt
from app.core.database import get_db
from app.core.deps import get_current_user, require_role, student_course_ids
from app.integrations.meeting_factory import get_provider
from app.models import (
    MeetingProvider,
    ProviderName,
    Schedule,
    User,
    UserRole,
    VirtualMeeting,
)
from app.schemas.meeting import (
    ProviderRead,
    ProviderUpsert,
    VirtualMeetingCreate,
    VirtualMeetingRead,
    VirtualMeetingUpdate,
)

router = APIRouter(prefix="/meetings", tags=["meetings"])

admin_only = require_role(UserRole.admin)
staff_only = require_role(UserRole.admin, UserRole.teacher)


# ---------------- Visibility ----------------
# A meeting is the door into a live classroom, so access follows the academic
# relationship rather than the role alone: admins see everything, a teacher sees
# the meetings of the schedules they teach, and a student sees the meetings of
# the courses they are actively enrolled in.
def _visible_meetings(db: Session, user: User) -> Select:
    stmt = select(VirtualMeeting)
    if user.role == UserRole.admin:
        return stmt
    if user.role == UserRole.teacher:
        return stmt.join(Schedule).where(Schedule.teacher_id == user.id)
    course_ids = student_course_ids(db, user.id)
    return stmt.join(Schedule).where(Schedule.course_id.in_(course_ids or [-1]))


def _get_visible_meeting(db: Session, user: User, meeting_id: int) -> VirtualMeeting:
    """Fetch a meeting the user is allowed to see, or 404.

    404 (not 403) on purpose: a stranger must not be able to tell an existing
    meeting from a non-existent one.
    """
    meeting = db.scalar(
        _visible_meetings(db, user).where(VirtualMeeting.id == meeting_id)
    )
    if meeting is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Meeting not found")
    return meeting


def _to_read(meeting: VirtualMeeting, user: User) -> VirtualMeetingRead:
    """Serialize a meeting, hiding the host link from students.

    ``host_url`` starts the class *as host*; only staff may ever receive it.
    """
    model = VirtualMeetingRead.model_validate(meeting)
    if user.role == UserRole.student:
        model.host_url = None
    return model


def _require_schedule_ownership(user: User, schedule: Schedule) -> None:
    """Teachers may only touch meetings on schedules they personally teach."""
    if user.role == UserRole.teacher and schedule.teacher_id != user.id:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "No impartes esta clase"
        )


# ---------------- Providers (admin) ----------------
@router.get("/providers", response_model=list[ProviderRead])
def list_providers(
    db: Session = Depends(get_db), _: User = Depends(admin_only)
) -> list[MeetingProvider]:
    return list(db.scalars(select(MeetingProvider)).all())


@router.put("/providers", response_model=ProviderRead)
def upsert_provider(
    payload: ProviderUpsert,
    db: Session = Depends(get_db),
    _: User = Depends(admin_only),
) -> MeetingProvider:
    provider = db.scalar(
        select(MeetingProvider).where(MeetingProvider.name == payload.name)
    )
    if provider is None:
        provider = MeetingProvider(name=payload.name)
        db.add(provider)
    provider.is_active = payload.is_active
    if payload.credentials is not None:
        provider.api_credentials_encrypted = encrypt(json.dumps(payload.credentials))
    db.commit()
    db.refresh(provider)
    return provider


# ---------------- Virtual meetings ----------------
@router.get("", response_model=list[VirtualMeetingRead])
def list_meetings(
    schedule_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[VirtualMeetingRead]:
    stmt = _visible_meetings(db, current_user)
    if schedule_id is not None:
        stmt = stmt.where(VirtualMeeting.schedule_id == schedule_id)
    return [_to_read(m, current_user) for m in db.scalars(stmt).all()]


@router.get("/{meeting_id}", response_model=VirtualMeetingRead)
def get_meeting(
    meeting_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> VirtualMeetingRead:
    meeting = _get_visible_meeting(db, current_user, meeting_id)
    return _to_read(meeting, current_user)


@router.post("", response_model=VirtualMeetingRead, status_code=status.HTTP_201_CREATED)
def create_meeting(
    payload: VirtualMeetingCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(staff_only),
) -> VirtualMeetingRead:
    schedule = db.get(Schedule, payload.schedule_id)
    if schedule is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Schedule not found")
    _require_schedule_ownership(current_user, schedule)

    provider_row = db.scalar(
        select(MeetingProvider).where(MeetingProvider.name == payload.provider)
    )
    if provider_row is None or not provider_row.is_active:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Provider '{payload.provider.value}' is not configured/active",
        )

    if payload.provider == ProviderName.manual and not payload.join_url:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "join_url is required for the manual provider",
        )

    duration = 60
    if payload.end_time:
        duration = max(
            1, int((payload.end_time - payload.start_time).total_seconds() // 60)
        )

    provider = get_provider(provider_row)
    details = provider.create_meeting(
        topic=schedule.course.name,
        start_time=payload.start_time,
        duration_minutes=duration,
        join_url=payload.join_url,
    )

    meeting = VirtualMeeting(
        schedule_id=schedule.id,
        provider_id=provider_row.id,
        external_meeting_id=details.external_meeting_id,
        join_url=details.join_url or payload.join_url,
        host_url=details.host_url,
        start_time=payload.start_time,
        end_time=payload.end_time,
    )
    db.add(meeting)
    db.commit()
    db.refresh(meeting)
    return _to_read(meeting, current_user)


@router.patch("/{meeting_id}", response_model=VirtualMeetingRead)
def update_meeting(
    meeting_id: int,
    payload: VirtualMeetingUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(staff_only),
) -> VirtualMeetingRead:
    meeting = _get_visible_meeting(db, current_user, meeting_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(meeting, field, value)
    db.commit()
    db.refresh(meeting)
    return _to_read(meeting, current_user)


@router.delete("/{meeting_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_meeting(
    meeting_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(staff_only),
) -> None:
    meeting = _get_visible_meeting(db, current_user, meeting_id)
    db.delete(meeting)
    db.commit()
