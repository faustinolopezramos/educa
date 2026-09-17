import pytest
from datetime import date, time
from app.models.enums import MakeUpStatus, MAKEUP_STATUS_LABELS, Modality
from app.models.make_up_credit import MakeUpCredit
from app.models.user import User
from app.models.class_session import ClassSession
from app.schemas.makeup import (
    CandidateSessionRead,
    MakeUpBookRequest,
    MakeUpCreditCreate,
    MakeUpCreditRead,
)
from app.schemas.teacher_payroll import (
    AcademyPayrollSummary,
    TeacherHourlyRateUpdate,
    TeacherPayrollReport,
    TeacherPayrollSessionItem,
    TeacherPayrollSummary,
)
from app.services.teacher_payroll import _session_duration_hours


def test_makeup_status_enum_and_labels():
    expected = {"available", "booked", "attended", "expired", "cancelled"}
    actual = {s.value for s in MakeUpStatus}
    assert expected.issubset(actual)

    for status in MakeUpStatus:
        assert status in MAKEUP_STATUS_LABELS
        assert len(MAKEUP_STATUS_LABELS[status]) > 0


def test_user_hourly_rate_field():
    u = User(
        email="teacher@test.com",
        password_hash="hash",
        full_name="Profe Test",
        hourly_rate=25.50,
    )
    assert u.hourly_rate == 25.50


def test_makeup_credit_model_init():
    credit = MakeUpCredit(
        student_id=1,
        enrollment_id=2,
        origin_session_id=3,
        status=MakeUpStatus.available,
        expires_at=date(2026, 12, 31),
        notes="Justified medical absence",
    )
    assert credit.student_id == 1
    assert credit.enrollment_id == 2
    assert credit.status == MakeUpStatus.available
    assert credit.expires_at == date(2026, 12, 31)
    assert credit.notes == "Justified medical absence"


def test_makeup_schemas():
    create_schema = MakeUpCreditCreate(
        student_id=5,
        enrollment_id=12,
        origin_session_id=99,
        expires_at=date(2026, 10, 1),
        notes="Auto-excused",
    )
    assert create_schema.student_id == 5
    assert create_schema.origin_session_id == 99

    book_req = MakeUpBookRequest(target_session_id=105)
    assert book_req.target_session_id == 105

    candidate = CandidateSessionRead(
        session_id=105,
        course_id=20,
        course_name="Inglés B2 Intensivo",
        level_id=4,
        level_name="B2",
        date=date(2026, 9, 20),
        start_time=time(18, 0),
        end_time=time(19, 30),
        teacher_name="Sarah Connor",
        modality=Modality.virtual,
        max_students=15,
        occupied_seats=12,
        available_seats=3,
    )
    assert candidate.available_seats == 3
    assert candidate.max_students == 15
    assert candidate.occupied_seats == 12


def test_session_duration_calculation():
    # 1.5 hours: 10:00 to 11:30
    sess = ClassSession(
        start_time=time(10, 0),
        end_time=time(11, 30),
        date=date(2026, 9, 20),
        teacher_id=1,
        schedule_id=1,
    )
    assert _session_duration_hours(sess) == 1.5

    # 1 hour: 18:00 to 19:00
    sess2 = ClassSession(
        start_time=time(18, 0),
        end_time=time(19, 0),
        date=date(2026, 9, 20),
        teacher_id=1,
        schedule_id=1,
    )
    assert _session_duration_hours(sess2) == 1.0

    # 45 minutes: 08:15 to 09:00 -> 0.75 hours
    sess3 = ClassSession(
        start_time=time(8, 15),
        end_time=time(9, 0),
        date=date(2026, 9, 20),
        teacher_id=1,
        schedule_id=1,
    )
    assert _session_duration_hours(sess3) == 0.75


def test_teacher_payroll_schemas():
    item = TeacherPayrollSessionItem(
        session_id=1,
        course_id=2,
        course_name="Francés A1",
        date=date(2026, 9, 10),
        start_time=time(9, 0),
        end_time=time(11, 0),
        duration_hours=2.0,
        status="held",
        register_closed=True,
        hourly_rate=30.0,
        amount=60.0,
    )
    assert item.duration_hours == 2.0
    assert item.amount == 60.0

    report = TeacherPayrollReport(
        teacher_id=10,
        teacher_name="Jean Dupont",
        email="jean@educa.io",
        hourly_rate=30.0,
        date_from=date(2026, 9, 1),
        date_to=date(2026, 9, 30),
        total_sessions=1,
        total_hours=2.0,
        total_amount=60.0,
        sessions=[item],
    )
    assert report.total_hours == 2.0
    assert report.total_amount == 60.0

    rate_up = TeacherHourlyRateUpdate(hourly_rate=35.5)
    assert rate_up.hourly_rate == 35.5
