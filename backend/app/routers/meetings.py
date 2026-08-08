import json
import logging
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import httpx

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from sqlalchemy import Select

from app.core.config import settings
from app.core.crypto import encrypt
from app.core.database import get_db
from app.core.deps import (
    apply_tenant,
    course_in_scope_or_404,
    get_current_user,
    is_admin,
    require_permission,
    require_staff_permission,
    student_course_ids,
)
from app.integrations.meeting_factory import get_provider
from app.models import (
    ClassSession,
    Course,
    ENROLLMENT_HAS_ACCESS,
    Enrollment,
    MeetingProvider,
    Permission,
    ProviderName,
    Schedule,
    SessionStatus,
    User,
    UserRole,
    VirtualMeeting,
)
from app.schemas.meeting import (
    LobbyJoinInfo,
    ProviderRead,
    ProviderUpsert,
    VirtualMeetingCreate,
    VirtualMeetingRead,
    VirtualMeetingUpdate,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/meetings", tags=["meetings"])

admin_only = require_permission(Permission.manage_schedules)
staff_only = require_staff_permission(Permission.manage_schedules)


# ---------------- Visibility ----------------
# A meeting is the door into a live classroom, so access follows the academic
# relationship rather than the role alone: admins see everything, a teacher sees
# the meetings of the schedules they teach, and a student sees the meetings of
# the courses they are actively enrolled in.
def _visible_meetings(db: Session, user: User) -> Select:
    # Even an admin only ever sees their own academy's classrooms.
    stmt = apply_tenant(
        select(VirtualMeeting)
        .join(Schedule, VirtualMeeting.schedule_id == Schedule.id)
        .join(Course, Schedule.course_id == Course.id),
        Course.tenant_id,
        user,
    )
    if is_admin(user):
        return stmt
    if user.role == UserRole.teacher:
        return stmt.where(Schedule.teacher_id == user.id)
    course_ids = student_course_ids(db, user.id)
    return stmt.where(Schedule.course_id.in_(course_ids or [-1]))


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
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No impartes esta clase")


# ---------------- Providers (admin) ----------------
@router.get("/providers", response_model=list[ProviderRead])
def list_providers(
    db: Session = Depends(get_db),
    current_user: User = Depends(admin_only),
) -> list[MeetingProvider]:
    stmt = select(MeetingProvider)
    if current_user.tenant_id:
        stmt = stmt.where(MeetingProvider.tenant_id == current_user.tenant_id)
    return list(db.scalars(stmt).all())


@router.put("/providers", response_model=ProviderRead)
def upsert_provider(
    payload: ProviderUpsert,
    db: Session = Depends(get_db),
    current_user: User = Depends(admin_only),
) -> MeetingProvider:
    stmt = select(MeetingProvider).where(MeetingProvider.name == payload.name)
    if current_user.tenant_id:
        stmt = stmt.where(MeetingProvider.tenant_id == current_user.tenant_id)
    provider = db.scalar(stmt)

    if provider is None:
        provider = MeetingProvider(name=payload.name, tenant_id=current_user.tenant_id)
        db.add(provider)
    provider.is_active = payload.is_active
    if payload.credentials is not None:
        provider.api_credentials_encrypted = encrypt(json.dumps(payload.credentials))
    db.commit()
    db.refresh(provider)
    return provider


@router.post("/providers/test")
def test_provider_connection(
    payload: ProviderUpsert,
    _: User = Depends(admin_only),
) -> dict[str, str | bool]:
    """Test connection with external Zoom or Google credentials."""
    if payload.name == ProviderName.manual:
        return {
            "status": "ok",
            "message": "El proveedor manual no requiere credenciales de API.",
        }

    if not payload.credentials:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Debe proporcionar un diccionario de credenciales para probar la conexión.",
        )

    try:
        dummy_row = MeetingProvider(name=payload.name)
        dummy_row.api_credentials_encrypted = encrypt(json.dumps(payload.credentials))
        provider_instance = get_provider(dummy_row)

        if payload.name == ProviderName.zoom:
            # Test obtaining S2S token
            token = getattr(provider_instance, "_get_access_token")()
            if token:
                return {
                    "status": "ok",
                    "message": "Conexión exitosa con Zoom API (OAuth Server-to-Server).",
                }
        elif payload.name == ProviderName.google:
            return {
                "status": "ok",
                "message": "Configuración de Google Calendar API validada.",
            }

        return {"status": "ok", "message": "Conexión probada con éxito."}
    except Exception as exc:
        # The exception text can carry back whatever the provider echoed of the
        # credentials we just sent it, so it goes to the log, not to the client.
        logger.warning(
            "Provider connection test failed for %s", payload.name.value, exc_info=exc
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"No se pudo conectar con {payload.name.value}. "
                "Revisa las credenciales; el detalle quedó en el log del servidor."
            ),
        )


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
    # `_require_schedule_ownership` only constrains teachers, so without this an
    # admin could hang a meeting off another academy's class — and run it on
    # their own academy's provider credentials.
    course_in_scope_or_404(db, current_user, schedule.course_id)
    _require_schedule_ownership(current_user, schedule)

    # Scoped like `list_providers`/`upsert_provider`: a schedule must be run
    # through its own academy's provider, never another tenant's credentials.
    provider_stmt = select(MeetingProvider).where(
        MeetingProvider.name == payload.provider
    )
    if current_user.tenant_id:
        provider_stmt = provider_stmt.where(
            MeetingProvider.tenant_id == current_user.tenant_id
        )
    provider_row = db.scalar(provider_stmt)
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
    try:
        details = provider.create_meeting(
            topic=schedule.course.name,
            start_time=payload.start_time,
            duration_minutes=duration,
            join_url=payload.join_url,
        )
    except NotImplementedError:
        # Zoom and Google are implemented; Teams is not yet registered. A clear
        # 501 beats an opaque 500 for any provider still missing an adapter.
        raise HTTPException(
            status.HTTP_501_NOT_IMPLEMENTED,
            f"La integración con {payload.provider.value} aún no está disponible",
        )
    except ValueError as exc:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Credenciales o configuración inválida para {payload.provider.value}: {str(exc)}",
        )
    except httpx.HTTPError as exc:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            f"Error al comunicarse con la API de {payload.provider.value}: {str(exc)}",
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


# How early a student may step into the room before the class starts.
LOBBY_EARLY_ACCESS_MINUTES = 15
# How long after the class ends the student link remains active for Q&A / wrap-up.
LOBBY_LATE_ACCESS_MINUTES = 15


def lobby_access(
    *,
    cancelled: bool,
    start_dt: datetime,
    end_dt: datetime,
    now_dt: datetime,
    is_host: bool,
    join_url: str | None,
    host_url: str | None,
) -> LobbyJoinInfo:
    """Who may enter the room, and whether they get a link.

    Kept free of the database and of the clock so the window can be tested at
    its edges with fixed timestamps, instead of against whatever time the suite
    happens to run at. All datetimes must be timezone-aware.
    """
    minutes_remaining = max(0, int((start_dt - now_dt).total_seconds() // 60))

    # A class that was called off has no room to enter, for anyone.
    if cancelled:
        return LobbyJoinInfo(
            is_host=is_host,
            can_join=False,
            reason="Esta clase fue cancelada.",
            minutes_remaining=0,
        )

    if is_host:
        # Staff set the room up, so they are not held to the student window.
        return LobbyJoinInfo(
            join_url=join_url,
            host_url=host_url,
            is_host=True,
            can_join=True,
            minutes_remaining=minutes_remaining,
        )

    # Students get a window bounded at *both* ends (15m before start up to 15m after end).
    if now_dt < start_dt - timedelta(minutes=LOBBY_EARLY_ACCESS_MINUTES):
        return LobbyJoinInfo(
            can_join=False,
            reason=(
                f"El enlace a la clase estará disponible "
                f"{LOBBY_EARLY_ACCESS_MINUTES} minutos antes del inicio."
            ),
            minutes_remaining=minutes_remaining,
        )
    if now_dt > end_dt + timedelta(minutes=LOBBY_LATE_ACCESS_MINUTES):
        return LobbyJoinInfo(
            can_join=False,
            reason="Esta clase ya terminó.",
            minutes_remaining=0,
        )
    
    # Grace period after end_dt (within 15 minutes after class ended)
    if now_dt > end_dt:
        return LobbyJoinInfo(
            join_url=join_url,
            can_join=True,
            reason="La clase finalizó, pero el enlace sigue activo durante el período de gracia (15 min).",
            minutes_remaining=0,
        )

    return LobbyJoinInfo(
        join_url=join_url,
        can_join=True,
        minutes_remaining=minutes_remaining,
    )


@router.get("/session/{session_id}/lobby-info", response_model=LobbyJoinInfo)
def get_session_lobby_info(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> LobbyJoinInfo:
    session = db.get(ClassSession, session_id)
    if session is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")

    schedule = db.get(Schedule, session.schedule_id)
    if schedule is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Schedule not found")
    # The academy gate, before anything hands out a link. `is_host` below is
    # granted on role alone, so an admin used to receive the join *and host* URL
    # of any session id in the installation — the one door the lobby's whole
    # time-window exists to guard.
    course_in_scope_or_404(db, current_user, schedule.course_id)

    is_host = is_admin(current_user) or (
        current_user.role == UserRole.teacher and schedule.teacher_id == current_user.id
    )
    if current_user.role == UserRole.student:
        enrollment = db.scalar(
            select(Enrollment).where(
                Enrollment.student_id == current_user.id,
                Enrollment.course_id == schedule.course_id,
                Enrollment.status.in_(ENROLLMENT_HAS_ACCESS),
            )
        )
        if enrollment is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
        if enrollment.attendance_blocked:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                "Tu acceso a clases está restringido. Contacta a administración.",
            )

    meeting = db.scalar(
        select(VirtualMeeting).where(VirtualMeeting.schedule_id == schedule.id)
    )
    join_url = meeting.join_url if (meeting and meeting.join_url) else schedule.join_url
    host_url = (
        meeting.host_url if (meeting and is_host) else (join_url if is_host else None)
    )

    # The schedule stores wall-clock times with no zone, meaning the academy's
    # own clock — so that is the zone they have to be read back in. Both sides of
    # every comparison below are timezone-aware.
    tenant = db.get(Tenant, schedule.course.tenant_id) if (schedule.course and schedule.course.tenant_id) else None
    tz_name = (tenant.timezone if tenant and tenant.timezone else None) or settings.academy_timezone
    try:
        tz = ZoneInfo(tz_name)
    except Exception:
        tz = ZoneInfo(settings.academy_timezone)

    return lobby_access(
        cancelled=session.status == SessionStatus.cancelled,
        start_dt=datetime.combine(session.date, schedule.start_time, tzinfo=tz),
        end_dt=datetime.combine(session.date, schedule.end_time, tzinfo=tz),
        now_dt=datetime.now(tz),
        is_host=is_host,
        join_url=join_url,
        host_url=host_url,
    )
