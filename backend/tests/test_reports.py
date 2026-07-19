"""Daily / weekly / monthly reports over class sessions."""

from datetime import date, timedelta

import pytest

from app.models import PaymentStatus
from app.services.reports import period_range
from tests.conftest import auth


# ---------------- Period maths ----------------
def test_day_range_is_a_single_day():
    d = date(2026, 7, 16)
    assert period_range("day", d) == (d, d)


def test_week_range_is_monday_to_sunday():
    # 2026-07-16 is a Thursday.
    start, end = period_range("week", date(2026, 7, 16))
    assert start == date(2026, 7, 13) and start.weekday() == 0
    assert end == date(2026, 7, 19) and end.weekday() == 6


def test_month_range_spans_the_whole_month():
    start, end = period_range("month", date(2026, 7, 16))
    assert start == date(2026, 7, 1)
    assert end == date(2026, 7, 31)


def test_december_month_range_does_not_overflow_the_year():
    start, end = period_range("month", date(2026, 12, 10))
    assert start == date(2026, 12, 1)
    assert end == date(2026, 12, 31)


# ---------------- The report itself ----------------
@pytest.fixture
def marked_session(client, world):
    """One generated session of course_a with the student marked present."""
    admin = auth(client, "admin@test.com")
    sessions = client.post(
        "/sessions/generate", headers=admin, json={"schedule_id": world["schedule_a"].id}
    ).json()
    session = sessions[0]
    teacher = auth(client, "teacher_a@test.com")
    client.post(
        "/attendance",
        headers=teacher,
        json={"enrollment_id": world["enrollment"].id, "session_id": session["id"], "status": "present"},
    )
    client.post(
        "/grades",
        headers=teacher,
        json={"enrollment_id": world["enrollment"].id, "evaluation_name": "Nota del día", "score": 9, "session_id": session["id"]},
    )
    return session


def test_admin_month_report_counts_the_session_and_attendance(client, world, marked_session):
    admin = auth(client, "admin@test.com")
    res = client.get(
        "/reports", headers=admin, params={"period": "month", "anchor": marked_session["date"]}
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["sessions_total"] >= 1
    assert body["attendance_rate"] == 1.0
    assert body["grades_recorded"] == 1
    assert body["grade_average"] == 9.0


def test_a_day_report_outside_the_session_is_empty(client, world, marked_session):
    admin = auth(client, "admin@test.com")
    # A date guaranteed to have no session (the day before the term starts).
    empty_day = (date.fromisoformat(marked_session["date"]) - timedelta(days=1)).isoformat()
    body = client.get(
        "/reports", headers=admin, params={"period": "day", "anchor": empty_day}
    ).json()
    assert body["sessions_total"] == 0
    assert body["attendance_rate"] is None


def test_a_student_report_is_scoped_to_their_own_courses(client, world, marked_session):
    """The outsider is enrolled in nothing, so their report is empty."""
    outsider = auth(client, "outsider@test.com")
    body = client.get(
        "/reports", headers=outsider, params={"period": "month", "anchor": marked_session["date"]}
    ).json()
    assert body["sessions_total"] == 0


def test_an_absent_student_shows_up_as_at_risk(client, world):
    admin = auth(client, "admin@test.com")
    sessions = client.post(
        "/sessions/generate", headers=admin, json={"schedule_id": world["schedule_a"].id}
    ).json()
    teacher = auth(client, "teacher_a@test.com")
    # Mark absent across the first few sessions → attendance rate 0.
    for s in sessions[:3]:
        client.post(
            "/attendance",
            headers=teacher,
            json={"enrollment_id": world["enrollment"].id, "session_id": s["id"], "status": "absent"},
        )
    body = client.get(
        "/reports", headers=admin, params={"period": "month", "anchor": sessions[0]["date"]}
    ).json()
    at_risk = body["at_risk"]
    assert len(at_risk) == 1
    assert "asistencia baja" in at_risk[0]["reasons"]


def test_the_invalid_period_is_a_422(client, world):
    admin = auth(client, "admin@test.com")
    res = client.get("/reports", headers=admin, params={"period": "yearly"})
    assert res.status_code == 422


def test_csv_export_returns_a_download(client, world, marked_session):
    admin = auth(client, "admin@test.com")
    res = client.get(
        "/reports/export",
        headers=admin,
        params={"period": "month", "anchor": marked_session["date"]},
    )
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/csv")
    assert "attachment" in res.headers["content-disposition"]
    assert "Asistencia por curso" in res.text


def test_pdf_export_returns_a_pdf_download(client, world, marked_session):
    admin = auth(client, "admin@test.com")
    res = client.get(
        "/reports/export",
        headers=admin,
        params={"period": "month", "anchor": marked_session["date"], "format": "pdf"},
    )
    assert res.status_code == 200
    assert res.headers["content-type"] == "application/pdf"
    assert res.content[:5] == b"%PDF-", "a real PDF starts with the %PDF- magic"
    assert res.headers["content-disposition"].endswith('.pdf"')


def test_an_unknown_export_format_is_rejected(client, world):
    admin = auth(client, "admin@test.com")
    res = client.get(
        "/reports/export", headers=admin, params={"period": "month", "format": "xlsx"}
    )
    assert res.status_code == 422


def test_a_teacher_report_only_covers_their_courses(client, world, marked_session):
    """teacher_b teaches course_b (no activity), so their report is empty."""
    tb = auth(client, "teacher_b@test.com")
    body = client.get(
        "/reports", headers=tb, params={"period": "month", "anchor": marked_session["date"]}
    ).json()
    assert body["sessions_total"] == 0


# ---------------- Solvency gate (students only) ----------------
def test_a_solvent_student_sees_their_report(client, world):
    """Default enrolment is `pending` (not-yet-due), which counts as solvent."""
    student = auth(client, "student@test.com")
    res = client.get("/reports", headers=student, params={"period": "month"})
    assert res.status_code == 200, res.text


def test_an_overdue_student_is_blocked_from_the_report(client, world, db):
    world["enrollment"].payment_status = PaymentStatus.overdue
    db.commit()

    student = auth(client, "student@test.com")
    res = client.get("/reports", headers=student, params={"period": "month"})
    assert res.status_code == 403
    assert "pago" in res.json()["detail"].lower()

    # The export is gated the same way, so it can't be used as a back door.
    export = client.get(
        "/reports/export", headers=student, params={"period": "month"}
    )
    assert export.status_code == 403


def test_overdue_does_not_block_staff_reports(client, world, db):
    """The gate is student-only: an admin still sees everything."""
    world["enrollment"].payment_status = PaymentStatus.overdue
    db.commit()

    admin = auth(client, "admin@test.com")
    res = client.get("/reports", headers=admin, params={"period": "month"})
    assert res.status_code == 200, res.text
