import argparse
from datetime import timedelta

from sqlalchemy.orm import Session

from app.cli import cmd_refresh_payments
from app.models import (
    Course,
    Enrollment,
    EnrollmentStatus,
    Language,
    Level,
    Payment,
    PaymentKind,
    PaymentStatus,
    Tenant,
    User,
    UserRole,
)
from app.services.sequences import next_enrollment_code
from tests.conftest import TODAY


def test_cli_refresh_payments_updates_overdue(db):
    tenant = Tenant(name="Academia CLI", slug="cli-tenant", max_active_students=100)
    db.add(tenant)
    db.flush()

    student = User(
        email="cli-student@educa.com",
        full_name="CLI Student",
        role=UserRole.student,
        tenant_id=tenant.id,
        password_hash="***",
    )
    lang = Language(name="Ingles CLI", tenant_id=tenant.id)
    db.add_all([student, lang])
    db.flush()

    level = Level(name="A1", code="A1", language_id=lang.id)
    db.add(level)
    db.flush()

    course = Course(
        name="Curso CLI",
        level_id=level.id,
        tenant_id=tenant.id,
        start_date=TODAY,
        end_date=TODAY + timedelta(days=60),
    )
    db.add(course)
    db.flush()

    # Enrollment with a charge that is past due
    enrollment = Enrollment(
        student_id=student.id,
        course_id=course.id,
        status=EnrollmentStatus.active,
        enrollment_code=next_enrollment_code(db, year=TODAY.year),
        payment_status=PaymentStatus.pending,
    )
    db.add(enrollment)
    db.flush()

    # Charge due 5 days ago
    charge = Payment(
        enrollment_id=enrollment.id,
        kind=PaymentKind.charge,
        amount=100.0,
        due_date=TODAY - timedelta(days=5),
        recorded_by=student.id,
    )
    db.add(charge)
    db.commit()

    # Run CLI command
    args = argparse.Namespace(on=None, tenant_slug="cli-tenant")
    # El comando abre su propia sesión. Se le da una sobre la misma conexión que
    # la prueba, para que vea lo que ésta acaba de montar sin salir de la
    # transacción que se revierte al terminar.
    exit_code = cmd_refresh_payments(
        args,
        session_factory=lambda: Session(
            bind=db.connection(), join_transaction_mode="create_savepoint"
        ),
    )
    assert exit_code == 0

    # Refresh from db and assert status updated to overdue
    db.refresh(enrollment)
    assert enrollment.payment_status == PaymentStatus.overdue
