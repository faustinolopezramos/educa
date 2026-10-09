"""Tests for security audit hardening: assistant permissions, URL schemes, push SSRF and WhatsApp custom mode."""

import pytest
from pydantic import ValidationError

from app.models import Course, Enrollment, Permission, User, UserRole
from app.routers.payments import _can_view_enrollment_finance
from app.schemas.meeting import VirtualMeetingCreate, VirtualMeetingUpdate
from app.schemas.push import PushSubscriptionIn, is_safe_push_endpoint
from app.services.whatsapp import send_template


def test_can_view_enrollment_finance_assistant_requires_permission():
    """An assistant must have Permission.manage_finance to view student finances."""
    enrollment = Enrollment(id=1, student_id=10, course_id=100)

    admin = User(id=1, role=UserRole.admin, tenant_id=1)
    assert _can_view_enrollment_finance(admin, enrollment) is True

    superadmin = User(id=2, role=UserRole.superadmin, tenant_id=None)
    assert _can_view_enrollment_finance(superadmin, enrollment) is True

    # Assistant without finance permission cannot view
    assistant_no_fin = User(
        id=3,
        role=UserRole.assistant,
        tenant_id=1,
        permissions=[Permission.manage_schedules.value],
    )
    assert _can_view_enrollment_finance(assistant_no_fin, enrollment) is False

    # Assistant with finance permission can view
    assistant_with_fin = User(
        id=4,
        role=UserRole.assistant,
        tenant_id=1,
        permissions=[Permission.manage_finance.value],
    )
    assert _can_view_enrollment_finance(assistant_with_fin, enrollment) is True

    # Student can only view their own
    student = User(id=10, role=UserRole.student, tenant_id=1)
    other_student = User(id=11, role=UserRole.student, tenant_id=1)
    assert _can_view_enrollment_finance(student, enrollment) is True
    assert _can_view_enrollment_finance(other_student, enrollment) is False


def test_meeting_urls_reject_unsafe_protocols():
    """VirtualMeeting schemas reject javascript:, data: and other unsafe protocols."""
    from datetime import datetime, timezone

    # Valid HTTPS URL succeeds
    vm = VirtualMeetingCreate(
        schedule_id=1,
        start_time=datetime.now(timezone.utc),
        join_url="https://us02web.zoom.us/j/123456789",
    )
    assert vm.join_url == "https://us02web.zoom.us/j/123456789"

    # JavaScript protocol is rejected
    with pytest.raises(ValidationError):
        VirtualMeetingCreate(
            schedule_id=1,
            start_time=datetime.now(timezone.utc),
            join_url="javascript:alert(document.cookie)",
        )

    # Data URI is rejected
    with pytest.raises(ValidationError):
        VirtualMeetingUpdate(recording_url="data:text/html,<script>alert(1)</script>")


def test_push_endpoint_ssrf_protection():
    """Push endpoint validation rejects loopback, private networks, and internal domains."""
    # Legitimate external push services
    assert is_safe_push_endpoint("https://fcm.googleapis.com/fcm/send/abc123") is True
    assert is_safe_push_endpoint("https://updates.push.services.mozilla.com/wpush/v2/abc") is True

    # Loopback / localhost
    assert is_safe_push_endpoint("https://localhost/push") is False
    assert is_safe_push_endpoint("https://127.0.0.1:8080/push") is False
    assert is_safe_push_endpoint("https://[::1]/push") is False

    # Cloud metadata
    assert is_safe_push_endpoint("https://169.254.169.254/latest/meta-data/") is False
    assert is_safe_push_endpoint("https://metadata.google.internal/computeMetadata") is False

    # Private internal IPs
    assert is_safe_push_endpoint("https://10.0.0.1/push") is False
    assert is_safe_push_endpoint("https://192.168.1.50/push") is False
    assert is_safe_push_endpoint("https://172.16.0.1/push") is False

    # Scheme must be HTTPS
    assert is_safe_push_endpoint("http://fcm.googleapis.com/fcm/send/abc") is False

    # Pydantic schema validation rejects unsafe endpoints
    with pytest.raises(ValidationError):
        PushSubscriptionIn(
            endpoint="https://169.254.169.254/latest",
            keys={"p256dh": "dummy_p256", "auth": "dummy_auth"},
        )


def test_whatsapp_send_template_accepts_custom_credentials(monkeypatch):
    """send_template uses tenant-specific credentials when passed."""
    captured = {}

    def fake_post(url, json, headers, timeout):
        captured["url"] = url
        captured["headers"] = headers
        class MockResp:
            status_code = 200
            def json(self):
                return {"messages": [{"id": "wamid.HBgL..."}]}
        return MockResp()

    import httpx
    monkeypatch.setattr(httpx, "post", fake_post)

    msg_id = send_template(
        to="50212345678",
        template="educa_clase_cancelada",
        params=["Profesor", "Curso", "hoy"],
        token="custom_token_xyz",
        phone_number_id="custom_phone_999",
    )

    assert msg_id == "wamid.HBgL..."
    assert "custom_phone_999" in captured["url"]
    assert captured["headers"]["Authorization"] == "Bearer custom_token_xyz"
