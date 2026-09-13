from datetime import datetime, timezone
import pytest
from app.models import Permission, UserRole
from app.schemas.kardex import KardexSummary, KardexCourseEntry, StudentKardexResponse
from app.services.student_kardex import get_student_kardex
from tests.conftest import auth, make_user


def test_kardex_response_schema():
    summary = KardexSummary(
        global_gpa=8.5,
        overall_attendance_rate=95.0,
        total_courses_passed=2,
        total_courses_failed=0,
        total_certificates_earned=1,
        person_status="active",
        person_status_label="Activo",
        outstanding_balance=0.0,
    )
    entry = KardexCourseEntry(
        enrollment_id=1,
        course_id=10,
        course_title="Inglés A1",
        level_name="A1 - Principiante",
        status="certified",
        status_label="Certificado",
        enrollment_code="2026-00001",
        final_score=8.5,
        passed=True,
        certificate_code="EDUCA-TEST1234",
        balance=0.0,
    )
    response = StudentKardexResponse(
        student_id=5,
        student_name="Alumno Test",
        student_email="test@educa.com",
        phone="+502 5555-1111",
        nationality="Guatemala",
        summary=summary,
        history=[entry],
    )
    assert response.student_name == "Alumno Test"
    assert response.summary.global_gpa == 8.5
    assert len(response.history) == 1
    assert response.history[0].passed is True


# ---------------- Who may open an expediente ----------------
#
# The kardex gathers a student's whole record — every course, every certificate
# and the **outstanding balance** — so it answers to the same key as the rest of
# the directory, `manage_students`. It shipped behind mere authentication, which
# handed it to any teacher (over students they never taught) and to an assistant
# holding no permission at all.
def _kardex(client, email, student_id):
    return client.get(f"/users/{student_id}/kardex", headers=auth(client, email))


@pytest.fixture
def assistant(db):
    """Factory: an assistant holding exactly the permissions asked for."""

    def _make(*permissions: Permission, email: str):
        user = make_user(db, email, UserRole.assistant)
        user.permissions = [p.value for p in permissions]
        db.flush()
        return user

    return _make


def test_a_student_reads_their_own_expediente(client, world):
    res = _kardex(client, "student@test.com", world["student"].id)
    assert res.status_code == 200
    assert res.json()["student_id"] == world["student"].id


def test_a_student_cannot_read_someone_elses_expediente(client, world):
    assert _kardex(client, "outsider@test.com", world["student"].id).status_code == 403


def test_a_teacher_cannot_read_the_expediente_of_their_own_student(client, world):
    # teacher_a teaches the course this student is enrolled in, and still may
    # not see their financial standing or their record in other courses.
    assert _kardex(client, "teacher_a@test.com", world["student"].id).status_code == 403


def test_an_admin_reads_any_expediente(client, world):
    assert _kardex(client, "admin@test.com", world["student"].id).status_code == 200


def test_an_assistant_needs_manage_students_for_the_expediente(
    client, assistant, world
):
    assistant(Permission.manage_finance, email="finance_only@test.com")
    assert _kardex(client, "finance_only@test.com", world["student"].id).status_code == 403

    assistant(Permission.manage_students, email="people@test.com")
    assert _kardex(client, "people@test.com", world["student"].id).status_code == 200


def test_there_is_no_expediente_for_someone_who_is_not_a_student(client, world):
    # An empty kardex would read as "this student has no history"; 404 says the
    # right thing, which is that there was no student here to begin with.
    assert _kardex(client, "admin@test.com", world["teacher_a"].id).status_code == 404


def test_student_with_no_enrollments_can_read_expediente(client, db):
    new_student = make_user(db, "new_student@test.com", UserRole.student)
    db.commit()
    res = _kardex(client, "new_student@test.com", new_student.id)
    assert res.status_code == 200
    data = res.json()
    assert data["student_id"] == new_student.id
    assert data["summary"]["person_status"] == "prospect"
    assert data["summary"]["person_status_label"] == "Prospecto / Sin Curso"
    assert len(data["history"]) == 0
