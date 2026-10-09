"""El recálculo horario de morosidad que corre en el bucle de fondo.

Antes nada lo programaba: una cuota vencida seguía "pendiente" hasta que un
admin pulsaba un botón o alguien lanzaba el comando a mano.
"""

from datetime import timedelta

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
from app.services.background import refresh_payments
from app.services.sequences import next_enrollment_code
from tests.conftest import TODAY


def _overdue_enrollment(db, slug: str, *, active: bool = True) -> Enrollment:
    tenant = Tenant(name=slug, slug=slug, max_active_students=100, is_active=active)
    db.add(tenant)
    db.flush()
    student = User(
        email=f"alumno@{slug}.com",
        full_name="Alumno",
        role=UserRole.student,
        tenant_id=tenant.id,
        password_hash="***",
    )
    lang = Language(name=f"Inglés {slug}", tenant_id=tenant.id)
    db.add_all([student, lang])
    db.flush()
    level = Level(name="A1", code="A1", language_id=lang.id)
    db.add(level)
    db.flush()
    course = Course(
        name=f"Curso {slug}",
        level_id=level.id,
        tenant_id=tenant.id,
        start_date=TODAY,
        end_date=TODAY + timedelta(days=60),
    )
    db.add(course)
    db.flush()
    enrollment = Enrollment(
        student_id=student.id,
        course_id=course.id,
        status=EnrollmentStatus.active,
        enrollment_code=next_enrollment_code(db, year=TODAY.year),
        payment_status=PaymentStatus.pending,
    )
    db.add(enrollment)
    db.flush()
    db.add(
        Payment(
            enrollment_id=enrollment.id,
            kind=PaymentKind.charge,
            amount=100,
            due_date=TODAY - timedelta(days=5),
            recorded_by=student.id,
        )
    )
    db.flush()
    return enrollment


def test_the_hourly_job_marks_a_past_due_cuota_as_overdue(db):
    enrollment = _overdue_enrollment(db, "job-activa")

    assert refresh_payments(db) >= 1

    db.refresh(enrollment)
    assert enrollment.payment_status == PaymentStatus.overdue


def test_the_hourly_job_leaves_suspended_academies_alone(db):
    enrollment = _overdue_enrollment(db, "job-suspendida", active=False)

    refresh_payments(db)

    db.refresh(enrollment)
    assert enrollment.payment_status == PaymentStatus.pending
