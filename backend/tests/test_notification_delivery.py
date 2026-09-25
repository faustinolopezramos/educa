"""Notifications leaving the app: the email/WhatsApp outbox and its dispatcher.

Nothing here reaches a real SMTP server or Meta: channels are "configured" by
patching settings, and sending is either a fake passed to `dispatch_pending`
or a patched `httpx.post`.
"""

from datetime import date, datetime, timedelta, timezone

import httpx
import pytest
from sqlalchemy import select

from app.core.config import settings
from app.models import DeliveryStatus, Notification, NotificationDelivery
from app.services import whatsapp
from app.services.delivery import MAX_ATTEMPTS, dispatch_pending
from app.services.email import DeliveryError
from app.services.notifications import WHATSAPP_TEMPLATES, fecha_larga, notify
from app.services.whatsapp import normalize_phone, send_template
from tests.conftest import auth


@pytest.fixture
def no_loop(monkeypatch):
    # Que el lifespan de la API no arranque su propio despachador en paralelo.
    monkeypatch.setattr(settings, "notifications_dispatch_interval_seconds", 0)


@pytest.fixture
def email_on(monkeypatch, no_loop):
    monkeypatch.setattr(settings, "smtp_host", "smtp.test")


@pytest.fixture
def whatsapp_on(monkeypatch, no_loop):
    monkeypatch.setattr(settings, "whatsapp_token", "tok")
    monkeypatch.setattr(settings, "whatsapp_phone_number_id", "123")
    monkeypatch.setattr(settings, "whatsapp_default_country_code", "502")


@pytest.fixture
def session_a(client, world):
    admin = auth(client, "admin@test.com")
    return client.post(
        "/sessions/generate", headers=admin, json={"schedule_id": world["schedule_a"].id}
    ).json()[0]


def _cancel(client, session_id):
    admin = auth(client, "admin@test.com")
    res = client.post(f"/sessions/{session_id}/cancel", headers=admin, json={"reason": "x"})
    assert res.status_code == 200, res.text


def _deliveries(db, user_id):
    return list(
        db.scalars(
            select(NotificationDelivery)
            .join(Notification)
            .where(Notification.recipient_id == user_id)
        ).all()
    )


# ---------------- What gets queued ----------------
def test_without_channels_nothing_leaves_the_app(client, db, world, session_a, no_loop):
    _cancel(client, session_a["id"])
    assert _deliveries(db, world["student"].id) == []


def test_cancelling_queues_an_email_to_the_student(client, db, world, session_a, email_on):
    _cancel(client, session_a["id"])
    [d] = _deliveries(db, world["student"].id)
    assert (d.channel, d.destination, d.status) == ("email", "student@test.com", "pending")


def test_the_message_reads_like_a_sentence_not_an_iso_key(client, world, session_a, no_loop):
    _cancel(client, session_a["id"])
    student = auth(client, "student@test.com")
    body = client.get("/notifications", headers=student).json()[0]["body"]
    assert world["course_a"].name in body
    assert fecha_larga(date.fromisoformat(session_a["date"])) in body


def test_email_opt_out_and_inactive_accounts_are_respected(
    client, db, world, session_a, email_on
):
    world["student"].notify_email = False
    db.flush()
    _cancel(client, session_a["id"])
    assert _deliveries(db, world["student"].id) == []

    world["student"].notify_email = True
    world["student"].is_active = False
    db.flush()
    notify(db, [world["student"].id], "x", "t", "b")
    db.flush()
    assert _deliveries(db, world["student"].id) == []


def test_whatsapp_needs_consent_and_a_usable_phone(client, db, world, whatsapp_on):
    admin = auth(client, "admin@test.com")
    first, second = client.post(
        "/sessions/generate", headers=admin, json={"schedule_id": world["schedule_a"].id}
    ).json()[:2]
    student = world["student"]
    student.phone = "5555-1234"
    db.flush()
    _cancel(client, first["id"])
    assert _deliveries(db, student.id) == []  # sin consentimiento, nada

    student.notify_whatsapp = True
    db.flush()
    new_date = (date.fromisoformat(second["date"]) + timedelta(days=2)).isoformat()
    res = client.post(
        f"/sessions/{second['id']}/reschedule", headers=admin, json={"new_date": new_date}
    )
    assert res.status_code == 200, res.text
    [d] = _deliveries(db, student.id)
    assert (d.channel, d.destination) == ("whatsapp", "50255551234")


def test_kinds_without_a_template_skip_whatsapp(db, world, whatsapp_on):
    world["teacher_a"].phone = "+50255550000"
    world["teacher_a"].notify_whatsapp = True
    db.flush()
    notify(db, [world["teacher_a"].id], "at_risk", "t", "b", data={"x": 1})
    db.flush()
    assert _deliveries(db, world["teacher_a"].id) == []


def test_user_sets_own_preferences(client, world, no_loop):
    student = auth(client, "student@test.com")
    res = client.patch("/auth/me", headers=student, json={"notify_whatsapp": True})
    assert res.status_code == 200
    assert res.json()["notify_whatsapp"] is True
    assert res.json()["notify_email"] is True
    assert client.patch("/auth/me", headers=student, json={"notify_email": None}).status_code == 422


# ---------------- Templates and phones ----------------
@pytest.mark.parametrize(
    "raw, expected",
    [
        ("5555-1234", "50255551234"),
        ("+502 5555 1234", "50255551234"),
        ("50255551234", "50255551234"),
        ("0050255551234", "50255551234"),
        ("5020 1234", "50250201234"),  # un número local que empieza por 502
        ("+1 (415) 555-0100", "14155550100"),
        ("123", None),
        ("", None),
        (None, None),
    ],
)
def test_normalize_phone(raw, expected, monkeypatch):
    monkeypatch.setattr(settings, "whatsapp_default_country_code", "502")
    assert normalize_phone(raw) == expected


def test_reschedule_template_parameters(world):
    build = WHATSAPP_TEMPLATES["session_cancelled"]
    world["student"].full_name = "Ana López"
    data = {
        "course": "Inglés A1",
        "date": "2026-09-14",
        "start_time": "18:00",
        "rescheduled_to": "2026-09-16",
    }
    assert build(world["student"], data) == (
        "educa_clase_reprogramada",
        ["Ana", "Inglés A1", "lunes 14 de septiembre a las 18:00", "miércoles 16 de septiembre"],
    )
    data["rescheduled_to"] = None
    assert build(world["student"], data)[0] == "educa_clase_cancelada"


def test_send_template_request_and_errors(monkeypatch, whatsapp_on):
    calls = []

    def fake_post(url, json, headers, timeout):
        calls.append((url, json, headers))
        return httpx.Response(200, json={"messages": [{"id": "wamid.1"}]})

    monkeypatch.setattr(whatsapp.httpx, "post", fake_post)
    assert send_template("50255551234", "educa_clase_cancelada", ["Ana"]) == "wamid.1"
    url, body, headers = calls[0]
    assert url.endswith("/123/messages")
    assert headers["Authorization"] == "Bearer tok"
    assert body["template"]["name"] == "educa_clase_cancelada"
    assert body["template"]["components"][0]["parameters"] == [{"type": "text", "text": "Ana"}]

    def rejected(*a, **k):
        return httpx.Response(400, json={"error": {"code": 132001, "message": "no existe"}})

    monkeypatch.setattr(whatsapp.httpx, "post", rejected)
    with pytest.raises(DeliveryError) as exc:
        send_template("50255551234", "x", [])
    assert exc.value.permanent and "132001" in str(exc.value)

    monkeypatch.setattr(whatsapp.httpx, "post", lambda *a, **k: httpx.Response(503))
    with pytest.raises(DeliveryError) as exc:
        send_template("50255551234", "x", [])
    assert not exc.value.permanent


# ---------------- The dispatcher ----------------
@pytest.fixture
def queued(db, world, email_on):
    notify(db, [world["student"].id], "x", "Título", "Cuerpo")
    db.flush()
    [d] = _deliveries(db, world["student"].id)
    return d


def test_dispatch_marks_sent(db, queued):
    results = dispatch_pending(db, send=lambda db, d: "msg-1")
    assert results["sent"] == 1
    assert (queued.status, queued.provider_message_id, queued.attempts) == ("sent", "msg-1", 1)
    assert dispatch_pending(db, send=lambda db, d: "again") == {}  # no se reenvía


def test_transient_failure_is_retried_later(db, queued):
    def boom(db, d):
        raise DeliveryError("timeout")

    dispatch_pending(db, send=boom)
    assert queued.status == DeliveryStatus.pending
    assert queued.attempts == 1 and queued.last_error == "timeout"
    assert queued.next_attempt_at > datetime.now(timezone.utc)
    # Aún no toca: el siguiente barrido no lo intenta.
    assert dispatch_pending(db, send=boom) == {}


def test_permanent_failure_and_exhausted_retries_fail(db, queued):
    def rejected(db, d):
        raise DeliveryError("bounced", permanent=True)

    dispatch_pending(db, send=rejected)
    assert queued.status == DeliveryStatus.failed

    queued.status = DeliveryStatus.pending
    queued.attempts = MAX_ATTEMPTS - 1
    db.flush()

    def boom(db, d):
        raise DeliveryError("timeout")

    dispatch_pending(db, send=boom)
    assert queued.status == DeliveryStatus.failed


def test_stale_deliveries_expire_instead_of_sending(db, queued):
    queued.created_at = datetime.now(timezone.utc) - timedelta(days=1)
    db.flush()
    sent = []
    results = dispatch_pending(db, send=lambda db, d: sent.append(d) or "x")
    db.refresh(queued)
    assert sent == [] and results["expired"] == 1
    assert queued.status == DeliveryStatus.expired


# ---------------- Scope ----------------
def test_director_alerts_stay_inside_the_academy(db, world):
    from app.models import Tenant, UserRole
    from app.services.notifications import notify_directors_of_at_risk
    from tests.conftest import make_user

    mine, other = Tenant(name="Mía", slug="mia-t"), Tenant(name="Otra", slug="otra-t")
    db.add_all([mine, other])
    db.flush()
    my_admin = make_user(db, "dir@mia.test", UserRole.admin)
    their_admin = make_user(db, "dir@otra.test", UserRole.admin)
    my_admin.tenant_id, their_admin.tenant_id = mine.id, other.id
    db.flush()

    assert notify_directors_of_at_risk(db, mine.id, 3, 1) == 1
    db.flush()
    recipients = set(db.scalars(select(Notification.recipient_id)).all())
    assert my_admin.id in recipients and their_admin.id not in recipients
