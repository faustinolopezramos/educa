"""`GET /dashboard`: what is waiting on the caller, per role and per permission.

Every home screen used to open with counts — students, classes, attendance rate
— that were true and inert. An admin could read all three and still not know
that a matrícula had fallen into arrears, that last week's classes were never
registered, or that a course was one seat from full.

The tray answers a different question, and it answers it *per permission*: an
assistant is never handed a queue they have no right to work.
"""

from datetime import date, timedelta

import pytest

from app.models import (
    ClassSession,
    Enrollment,
    Payment,
    PaymentKind,
    PaymentStatus,
    Permission,
    User,
    UserRole,
)
from app.services.sequences import next_enrollment_code
from tests.conftest import auth, make_user


def _kinds(client, headers) -> set[str]:
    res = client.get("/dashboard", headers=headers)
    assert res.status_code == 200, res.text
    return {item["kind"] for item in res.json()["items"]}


def _item(client, headers, kind) -> dict | None:
    res = client.get("/dashboard", headers=headers)
    assert res.status_code == 200, res.text
    return next((i for i in res.json()["items"] if i["kind"] == kind), None)


@pytest.fixture
def assistant(db):
    def _make(*permissions: Permission, email: str = "assistant@test.com") -> User:
        user = make_user(db, email, UserRole.assistant)
        user.permissions = [p.value for p in permissions]
        db.flush()
        return user

    return _make


# ---------------- A quiet academy ----------------
def test_an_academy_with_nothing_pending_returns_an_empty_tray(client, world):
    admin = auth(client, "admin@test.com")
    res = client.get("/dashboard", headers=admin)
    assert res.status_code == 200, res.text
    assert res.json()["items"] == []
    assert res.json()["role"] == "admin"


# ---------------- Money ----------------
def test_an_overdue_matricula_reaches_the_admin_with_its_amount(client, db, world):
    """The old home screen said "3 alumnos"; it never said "someone owes 500"."""
    enrollment = db.get(Enrollment, world["enrollment"].id)
    enrollment.amount = 500.0
    enrollment.payment_status = PaymentStatus.overdue
    db.add(
        Payment(
            enrollment_id=enrollment.id,
            kind=PaymentKind.charge,
            amount=500.0,
            due_date=date(2020, 1, 1),
        )
    )
    db.flush()

    admin = auth(client, "admin@test.com")
    item = _item(client, admin, "overdue_enrollments")
    assert item is not None
    assert item["count"] == 1
    assert item["amount"] == 500.0
    assert item["severity"] == "critical"
    # Never a dead end: the row names the section that resolves it.
    assert item["section"] == "enrollments"


def test_a_partly_paid_debt_reports_only_what_is_still_owed(client, db, world):
    enrollment = db.get(Enrollment, world["enrollment"].id)
    enrollment.amount = 500.0
    enrollment.payment_status = PaymentStatus.overdue
    db.add_all(
        [
            Payment(
                enrollment_id=enrollment.id,
                kind=PaymentKind.charge,
                amount=500.0,
                due_date=date(2020, 1, 1),
            ),
            Payment(
                enrollment_id=enrollment.id, kind=PaymentKind.payment, amount=200.0
            ),
        ]
    )
    db.flush()

    admin = auth(client, "admin@test.com")
    assert _item(client, admin, "overdue_enrollments")["amount"] == 300.0


# ---------------- Classes nobody registered ----------------
def test_a_past_class_with_no_register_reaches_the_teacher(client, db, world):
    """`held` is written when a teacher takes attendance, so a past session
    still sitting at `scheduled` is one nobody filed. It belongs to the person
    who can file it."""
    db.add(
        ClassSession(
            schedule_id=world["schedule_a"].id,
            date=date.today() - timedelta(days=3),
        )
    )
    db.flush()

    teacher = auth(client, "teacher_a@test.com")
    item = _item(client, teacher, "unregistered_sessions")
    assert item is not None and item["count"] == 1
    # One click from the class it belongs to.
    assert item["section"] == "clases"


def test_the_admin_is_not_nagged_about_registers_they_cannot_take(client, db, world):
    """Taking a register is a teacher's action on one concrete session. Raising
    it on the admin's tray sent them to the course list, where there is nothing
    to do about it, and named neither the teacher nor the course — so even
    chasing whoever did not file had nothing to go on."""
    db.add(
        ClassSession(
            schedule_id=world["schedule_a"].id,
            date=date.today() - timedelta(days=3),
        )
    )
    db.flush()

    admin = auth(client, "admin@test.com")
    assert "unregistered_sessions" not in _kinds(client, admin)


def test_a_future_class_is_not_a_pending_register(client, db, world):
    db.add(
        ClassSession(
            schedule_id=world["schedule_a"].id,
            date=date.today() + timedelta(days=3),
        )
    )
    db.flush()
    teacher = auth(client, "teacher_a@test.com")
    assert _item(client, teacher, "unregistered_sessions") is None


def test_the_teacher_sees_only_their_own_unregistered_classes(client, db, world):
    db.add(
        ClassSession(
            schedule_id=world["schedule_b"].id,  # teacher_b's course
            date=date.today() - timedelta(days=2),
        )
    )
    db.flush()

    assert "unregistered_sessions" not in _kinds(client, auth(client, "teacher_a@test.com"))
    assert "unregistered_sessions" in _kinds(client, auth(client, "teacher_b@test.com"))


# ---------------- Capacity ----------------
def test_a_course_about_to_fill_up_is_worth_knowing_before_it_does(client, db, world):
    course = world["course_a"]
    course.max_students = 2  # one seat taken by the fixture enrollment
    db.flush()

    admin = auth(client, "admin@test.com")
    item = _item(client, admin, "courses_nearly_full")
    assert item is not None
    assert item["severity"] == "info"


# ---------------- Permissions shape the tray ----------------
def test_an_assistant_is_not_shown_money_they_cannot_touch(client, db, world, assistant):
    enrollment = db.get(Enrollment, world["enrollment"].id)
    enrollment.amount = 500.0
    enrollment.payment_status = PaymentStatus.overdue
    db.flush()

    assistant(Permission.manage_students)
    kinds = _kinds(client, auth(client, "assistant@test.com"))
    assert "overdue_enrollments" not in kinds


def test_an_assistant_with_manage_finance_is_shown_the_money(client, db, world, assistant):
    enrollment = db.get(Enrollment, world["enrollment"].id)
    enrollment.amount = 500.0
    enrollment.payment_status = PaymentStatus.overdue
    db.flush()

    assistant(Permission.manage_finance)
    kinds = _kinds(client, auth(client, "assistant@test.com"))
    assert "overdue_enrollments" in kinds


def test_the_dashboard_never_403s_on_its_own_home_screen(client, assistant):
    """A tray assembled from the caller's own permissions has nothing to refuse:
    an assistant with no permission at all gets an empty tray, not an error."""
    assistant()
    res = client.get("/dashboard", headers=auth(client, "assistant@test.com"))
    assert res.status_code == 200, res.text
    assert res.json()["items"] == []


# ---------------- Student ----------------
def test_a_student_is_told_what_they_owe_not_merely_that_they_owe(client, db, world):
    """The old banner said "tienes un pago vencido" and stopped there."""
    enrollment = db.get(Enrollment, world["enrollment"].id)
    enrollment.amount = 300.0
    enrollment.payment_status = PaymentStatus.overdue
    db.add(
        Payment(
            enrollment_id=enrollment.id,
            kind=PaymentKind.charge,
            amount=300.0,
            due_date=date(2020, 1, 1),
        )
    )
    db.flush()

    student = auth(client, "student@test.com")
    res = client.get("/dashboard", headers=student)
    assert res.status_code == 200, res.text
    assert res.json()["balance_due"] == 300.0
    item = _item(client, student, "payment_overdue")
    assert item is not None and item["amount"] == 300.0


def test_a_students_tray_never_mentions_another_students_debt(client, db, world):
    """`outsider` owes; `student` must not hear about it."""
    outsider_enrollment = Enrollment(
        student_id=world["outsider"].id,
        course_id=world["course_b"].id,
        amount=900.0,
        payment_status=PaymentStatus.overdue,
        enrollment_code=next_enrollment_code(db, year=date.today().year),
    )
    db.add(outsider_enrollment)
    db.flush()

    res = client.get("/dashboard", headers=auth(client, "student@test.com"))
    assert res.json()["balance_due"] == 0.0
    assert "payment_overdue" not in {i["kind"] for i in res.json()["items"]}


def test_a_teacher_is_never_handed_the_admin_queues(client, db, world):
    enrollment = db.get(Enrollment, world["enrollment"].id)
    enrollment.payment_status = PaymentStatus.overdue
    db.flush()

    kinds = _kinds(client, auth(client, "teacher_a@test.com"))
    assert "overdue_enrollments" not in kinds
    assert "courses_nearly_full" not in kinds
