"""Renovación al siguiente nivel: el alumno graduado pide plaza, dirección decide."""

from datetime import time, timedelta
from decimal import Decimal

import pytest

from app.models import (
    Course,
    CourseStatus,
    Enrollment,
    EnrollmentStatus,
    Level,
    Payment,
    PaymentKind,
    PaymentStatus,
    Schedule,
)
from app.services.sequences import next_enrollment_code
from tests.conftest import TODAY, auth, make_user
from app.models import UserRole


@pytest.fixture
def renewal(db, world):
    """The world's student graduated from A1 (cuota 500) with an A2 group open."""
    enrollment = world["enrollment"]
    enrollment.status = EnrollmentStatus.graduated
    enrollment.amount = Decimal("500.00")
    a1 = db.get(Level, world["course_a"].level_id)
    a2 = Level(language_id=a1.language_id, code="A2", name="Elemental A2")
    db.add(a2)
    db.flush()
    start = TODAY + timedelta(days=14)
    course = Course(
        level_id=a2.id,
        name="Inglés A2 — Sabatino",
        max_students=2,
        start_date=start,
        end_date=start + timedelta(days=90),
        status=CourseStatus.open,
    )
    db.add(course)
    db.flush()
    db.add(
        Schedule(
            course_id=course.id,
            teacher_id=world["teacher_a"].id,
            day_of_week=5,
            start_time=time(9, 0),
            end_time=time(11, 0),
            term_start=start,
            term_end=start + timedelta(days=90),
        )
    )
    db.flush()
    return {"from": enrollment, "course": course, "level": a2}


def _ask(client, headers, renewal):
    return client.post(
        "/renewals",
        headers=headers,
        json={"from_enrollment_id": renewal["from"].id, "course_id": renewal["course"].id},
    )


def test_a_graduated_student_sees_the_next_level_groups(client, renewal):
    student = auth(client, "student@test.com")
    res = client.get("/renewals/options", headers=student)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["blocked_reason"] is None
    [option] = body["options"]
    assert option["next_level_name"] == "Elemental A2"
    assert option["amount"] == 500.0
    [group] = option["courses"]
    assert group["id"] == renewal["course"].id
    assert group["seats_left"] == 2
    assert group["clashes"] is False
    assert group["schedules"][0]["day_of_week"] == 5
    assert option["request"] is None


def test_a_student_still_studying_is_offered_nothing(client, world, renewal, db):
    world["enrollment"].status = EnrollmentStatus.active
    db.flush()
    student = auth(client, "student@test.com")
    assert client.get("/renewals/options", headers=student).json()["options"] == []
    assert _ask(client, student, renewal).status_code == 409


def test_request_then_approval_opens_the_matricula_with_the_same_cuota(client, renewal, db):
    student = auth(client, "student@test.com")
    res = _ask(client, student, renewal)
    assert res.status_code == 201, res.text
    request = res.json()
    assert request["status"] == "pending"
    assert request["amount"] == 500.0

    # Asking holds no seat and opens no debt.
    assert (
        db.query(Enrollment).filter_by(course_id=renewal["course"].id).count() == 0
    )

    admin = auth(client, "admin@test.com")
    tray = client.get("/dashboard", headers=admin).json()["items"]
    item = next(i for i in tray if i["kind"] == "renewal_requests")
    assert item["count"] == 1 and item["section"] == "enrollments"
    assert [r["id"] for r in client.get(
        "/renewals?status_filter=pending", headers=admin
    ).json()] == [request["id"]]

    approved = client.post(f"/renewals/{request['id']}/approve", headers=admin)
    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] == "approved"

    enrollment = db.get(Enrollment, approved.json()["enrollment_id"])
    assert enrollment.course_id == renewal["course"].id
    assert enrollment.status == EnrollmentStatus.enrolled
    assert enrollment.amount == Decimal("500.00")
    charge = db.query(Payment).filter_by(enrollment_id=enrollment.id).one()
    assert charge.kind == PaymentKind.charge
    assert charge.due_date == renewal["course"].start_date

    # Renewed: nothing left to offer, and the student was told.
    assert client.get("/renewals/options", headers=student).json()["options"] == []
    notes = client.get("/notifications", headers=student).json()
    assert any(n["kind"] == "renewal_approved" for n in notes)


def test_a_rejection_explains_why_and_lets_the_student_pick_again(client, renewal):
    student = auth(client, "student@test.com")
    request = _ask(client, student, renewal).json()
    admin = auth(client, "admin@test.com")
    res = client.post(
        f"/renewals/{request['id']}/reject",
        headers=admin,
        json={"note": "Ese grupo se cierra; elige el dominical"},
    )
    assert res.status_code == 200, res.text

    [option] = client.get("/renewals/options", headers=student).json()["options"]
    assert option["request"]["status"] == "rejected"
    assert option["request"]["review_note"] == "Ese grupo se cierra; elige el dominical"
    notes = client.get("/notifications", headers=student).json()
    assert any("elige el dominical" in n["body"] for n in notes)

    assert _ask(client, student, renewal).status_code == 201


def test_one_pending_request_at_a_time(client, renewal):
    student = auth(client, "student@test.com")
    assert _ask(client, student, renewal).status_code == 201
    again = _ask(client, student, renewal)
    assert again.status_code == 409
    assert again.json()["detail"]["reason"] == "already_pending"


def test_a_student_can_withdraw_a_pending_request(client, renewal):
    student = auth(client, "student@test.com")
    request = _ask(client, student, renewal).json()
    assert client.delete(f"/renewals/{request['id']}", headers=student).status_code == 204
    [option] = client.get("/renewals/options", headers=student).json()["options"]
    assert option["request"] is None


def test_a_delinquent_student_must_pay_first(client, world, renewal, db):
    db.add(
        Enrollment(
            student_id=world["student"].id,
            course_id=world["course_b"].id,
            status=EnrollmentStatus.active,
            payment_status=PaymentStatus.overdue,
            enrollment_code=next_enrollment_code(db, year=TODAY.year),
        )
    )
    db.flush()
    student = auth(client, "student@test.com")
    assert client.get("/renewals/options", headers=student).json()["blocked_reason"] == "delinquent"
    res = _ask(client, student, renewal)
    assert res.status_code == 409
    assert res.json()["detail"]["reason"] == "delinquent"


def test_only_a_group_of_the_next_level_can_be_asked_for(client, world, renewal):
    student = auth(client, "student@test.com")
    res = client.post(
        "/renewals",
        headers=student,
        json={"from_enrollment_id": renewal["from"].id, "course_id": world["course_b"].id},
    )
    assert res.status_code == 409
    assert res.json()["detail"]["reason"] == "wrong_level"


def test_nobody_renews_from_someone_elses_matricula(client, renewal):
    outsider = auth(client, "outsider@test.com")
    assert _ask(client, outsider, renewal).status_code == 404


def test_approval_rechecks_capacity(client, renewal, db):
    student = auth(client, "student@test.com")
    request = _ask(client, student, renewal).json()
    # The group filled up between the request and the decision.
    for n in range(2):
        other = make_user(db, f"filler{n}@test.com", UserRole.student)
        db.add(
            Enrollment(
                student_id=other.id,
                course_id=renewal["course"].id,
                status=EnrollmentStatus.active,
                enrollment_code=next_enrollment_code(db, year=TODAY.year),
            )
        )
    db.flush()
    admin = auth(client, "admin@test.com")
    res = client.post(f"/renewals/{request['id']}/approve", headers=admin)
    assert res.status_code == 409
    assert res.json()["detail"]["reason"] == "capacity"
    pending = client.get("/renewals?status_filter=pending", headers=admin).json()
    assert [r["id"] for r in pending] == [request["id"]]


def test_teachers_and_students_cannot_review(client, renewal):
    student = auth(client, "student@test.com")
    request = _ask(client, student, renewal).json()
    teacher = auth(client, "teacher_a@test.com")
    assert client.get("/renewals", headers=teacher).status_code == 403
    assert client.post(f"/renewals/{request['id']}/approve", headers=student).status_code == 403
    assert client.post(f"/renewals/{request['id']}/approve", headers=teacher).status_code == 403
