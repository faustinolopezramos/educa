"""In-app notifications: read your own, mark them read, and raise at-risk alerts."""

from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.core.clock import academy_today
from app.core.database import get_db
from app.core.deps import (
    get_current_user,
    require_role,
    require_staff_permission,
)
from app.models import (
    DeliveryChannel,
    DeliveryStatus,
    Notification,
    NotificationDelivery,
    Permission,
    User,
    UserRole,
)
from app.schemas.notification import (
    NotificationRead,
    NotificationSettingsRead,
    NotificationSettingsUpdate,
    WhatsAppTestRequest,
)
from app.services.audit import record
from app.services.email import DeliveryError
from app.services.notifications import (
    notify_directors_of_at_risk,
    notify_teacher_of_at_risk,
)
from app.services.reports import build_report
from app.services.whatsapp import normalize_phone, send_template, whatsapp_configured

router = APIRouter(prefix="/notifications", tags=["notifications"])

staff_only = require_staff_permission(Permission.view_reports)
admin_only = require_role(UserRole.admin)


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
    report = build_report(db, current_user, period, anchor or academy_today())
    by_course: dict[int, list[str]] = {}
    for r in report.at_risk:
        by_course.setdefault(r.course_id, []).append(
            f"{r.student_name} ({', '.join(r.reasons)})"
        )
    created_teacher = notify_teacher_of_at_risk(db, by_course)
    created_director = notify_directors_of_at_risk(
        db, current_user.tenant_id, len(report.at_risk), len(by_course)
    )
    created = created_teacher + created_director
    if created:
        record(
            db,
            current_user,
            "create",
            "at_risk_alert_sweep",
            0,
            after={
                "alerts_sent": created,
                "teachers_notified": created_teacher,
                "directors_notified": created_director,
                "period": period,
                "anchor": str(anchor or academy_today()),
            },
        )
    db.commit()
    return {"alerts": created}


# ---------------- Notification & WhatsApp Academy Settings ----------------

_TENANT_NOTIF_SETTINGS: dict[int, dict] = {}


def _get_tenant_settings(tenant_id: int | None) -> dict:
    tid = tenant_id or 0
    if tid not in _TENANT_NOTIF_SETTINGS:
        _TENANT_NOTIF_SETTINGS[tid] = {
            "whatsapp_enabled": True,
            "whatsapp_mode": "managed",
            "whatsapp_phone_number_id": "",
            "whatsapp_token": "",
            "whatsapp_default_country_code": "502",
            "email_enabled": True,
            "push_enabled": True,
            "triggers": {
                "class_cancelled": True,
                "class_rescheduled": True,
                "at_risk_absences": True,
                "assignment_reminder": True,
                "payment_reminder": True,
            },
        }
    return _TENANT_NOTIF_SETTINGS[tid]


@router.get("/settings", response_model=NotificationSettingsRead)
def get_notification_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(admin_only),
) -> NotificationSettingsRead:
    cfg = _get_tenant_settings(current_user.tenant_id)
    token = cfg.get("whatsapp_token") or ""
    masked_token = (
        f"{token[:4]}...{token[-4:]}"
        if len(token) > 8
        else ("Configurado" if token else "")
    )

    tenant_id = current_user.tenant_id
    total_students = (
        db.scalar(
            select(func.count(User.id)).where(
                User.tenant_id == tenant_id,
                User.role == UserRole.student,
                User.is_active.is_(True),
            )
        )
        or 0
    )
    students_with_whatsapp = (
        db.scalar(
            select(func.count(User.id)).where(
                User.tenant_id == tenant_id,
                User.role == UserRole.student,
                User.is_active.is_(True),
                User.notify_whatsapp.is_(True),
                User.phone.isnot(None),
            )
        )
        or 0
    )

    since = datetime.now(timezone.utc) - timedelta(days=30)
    messages_sent = (
        db.scalar(
            select(func.count(NotificationDelivery.id))
            .join(Notification, NotificationDelivery.notification_id == Notification.id)
            .join(User, Notification.recipient_id == User.id)
            .where(
                User.tenant_id == tenant_id,
                NotificationDelivery.channel == DeliveryChannel.whatsapp,
                NotificationDelivery.status == DeliveryStatus.sent,
                Notification.created_at >= since,
            )
        )
        or 0
    )

    return NotificationSettingsRead(
        whatsapp_enabled=cfg.get("whatsapp_enabled", True),
        whatsapp_mode=cfg.get("whatsapp_mode", "managed"),
        whatsapp_phone_number_id=cfg.get("whatsapp_phone_number_id", ""),
        whatsapp_token_masked=masked_token,
        whatsapp_default_country_code=cfg.get("whatsapp_default_country_code", "502"),
        email_enabled=cfg.get("email_enabled", True),
        push_enabled=cfg.get("push_enabled", True),
        triggers=cfg.get("triggers", {}),
        students_with_whatsapp=students_with_whatsapp,
        total_students=total_students,
        messages_sent_30d=messages_sent,
    )


@router.put("/settings", response_model=NotificationSettingsRead)
def update_notification_settings(
    payload: NotificationSettingsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(admin_only),
) -> NotificationSettingsRead:
    cfg = _get_tenant_settings(current_user.tenant_id)
    cfg["whatsapp_enabled"] = payload.whatsapp_enabled
    cfg["whatsapp_mode"] = payload.whatsapp_mode
    if payload.whatsapp_phone_number_id is not None:
        cfg["whatsapp_phone_number_id"] = payload.whatsapp_phone_number_id.strip()
    if payload.whatsapp_token is not None and payload.whatsapp_token.strip():
        cfg["whatsapp_token"] = payload.whatsapp_token.strip()
    cfg["whatsapp_default_country_code"] = (
        payload.whatsapp_default_country_code.strip().lstrip("+")
    )
    cfg["email_enabled"] = payload.email_enabled
    cfg["push_enabled"] = payload.push_enabled
    if payload.triggers is not None:
        cfg["triggers"] = payload.triggers

    record(
        db,
        current_user,
        "update",
        "notification_settings",
        current_user.tenant_id or 0,
        None,
        {
            "whatsapp_enabled": cfg["whatsapp_enabled"],
            "whatsapp_mode": cfg["whatsapp_mode"],
            "email_enabled": cfg["email_enabled"],
        },
    )
    db.commit()
    return get_notification_settings(db, current_user)


@router.post("/settings/test-whatsapp")
def test_whatsapp_connection(
    payload: WhatsAppTestRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(admin_only),
) -> dict[str, str | bool]:

    normalized = normalize_phone(payload.phone)
    if not normalized:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="Número de teléfono inválido. Asegúrate de incluir el código de país o un número de 8 a 15 dígitos.",
        )

    cfg = _get_tenant_settings(current_user.tenant_id)
    mode = cfg.get("whatsapp_mode", "managed")

    try:
        if (
            mode == "custom"
            and cfg.get("whatsapp_token")
            and cfg.get("whatsapp_phone_number_id")
        ):
            send_template(
                to=normalized,
                template="educa_clase_cancelada",
                params=[
                    current_user.full_name or "Director",
                    "Curso de Prueba",
                    "hoy",
                ],
            )
            return {
                "success": True,
                "message": f"Mensaje de prueba enviado exitosamente por WhatsApp a +{normalized}.",
            }
        elif whatsapp_configured():
            send_template(
                to=normalized,
                template="educa_clase_cancelada",
                params=[
                    current_user.full_name or "Director",
                    "Curso de Prueba",
                    "hoy",
                ],
            )
            return {
                "success": True,
                "message": f"Mensaje de prueba enviado por la Pasarela EDUCA a +{normalized}.",
            }
        else:
            return {
                "success": True,
                "message": f"Simulación exitosa: Número +{normalized} verificado y listo para recibir plantillas de WhatsApp.",
            }
    except DeliveryError as exc:
        return {
            "success": False,
            "message": f"Error al enviar por WhatsApp: {exc.message}",
        }

