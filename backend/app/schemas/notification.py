from datetime import datetime

from pydantic import BaseModel, ConfigDict


class NotificationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    kind: str
    title: str
    body: str
    read_at: datetime | None
    created_at: datetime


class NotificationSettingsRead(BaseModel):
    whatsapp_enabled: bool = True
    whatsapp_mode: str = "managed"  # "managed" or "custom"
    whatsapp_phone_number_id: str = ""
    whatsapp_token_masked: str = ""
    whatsapp_default_country_code: str = "502"
    email_enabled: bool = True
    push_enabled: bool = True
    triggers: dict[str, bool] = {
        "class_cancelled": True,
        "class_rescheduled": True,
        "at_risk_absences": True,
        "assignment_reminder": True,
        "payment_reminder": True,
    }
    students_with_whatsapp: int = 0
    total_students: int = 0
    messages_sent_30d: int = 0


class NotificationSettingsUpdate(BaseModel):
    whatsapp_enabled: bool = True
    whatsapp_mode: str = "managed"
    whatsapp_phone_number_id: str | None = None
    whatsapp_token: str | None = None
    whatsapp_default_country_code: str = "502"
    email_enabled: bool = True
    push_enabled: bool = True
    triggers: dict[str, bool] | None = None


class WhatsAppTestRequest(BaseModel):
    phone: str
