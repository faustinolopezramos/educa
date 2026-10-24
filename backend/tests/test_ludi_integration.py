"""Pruebas de la integración con Ludi (Datanuki).

Verifica:
1. Solicitud y activación del paquete Ludi (Intermediación B2B Educa ↔ Academia).
2. Candados de seguridad: denegación si la academia no tiene activo el add-on.
3. Evaluación de pronunciación por voz y tutoría RAG.
4. Generación de quizzes y partidas en vivo (Kahoot con PIN).
5. Gamificación: otorgar XP y consulta de ranking del curso.
"""

from unittest.mock import patch
from datetime import timedelta
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models import (
    Course,
    CourseStatus,
    CourseTeacher,
    Enrollment,
    EnrollmentStatus,
    Language,
    Level,
    Tenant,
    User,
    UserRole,
)
from app.services.sequences import next_enrollment_code
from tests.conftest import TODAY, auth


def _user(db: Session, email: str, role: UserRole, tenant: Tenant | None = None) -> User:
    u = User(
        email=email,
        full_name=email.split("@")[0].capitalize(),
        role=role,
        password_hash=hash_password("secret123"),
        tenant_id=tenant.id if tenant else None,
    )
    db.add(u)
    db.flush()
    return u


def _setup_academy(db: Session, slug: str = "ludi-academy"):
    tenant = Tenant(name="Academia Ludi", slug=slug, max_active_students=100)
    db.add(tenant)
    db.flush()

    superadmin = _user(db, f"super@{slug}.com", UserRole.superadmin, None)
    admin = _user(db, f"admin@{slug}.com", UserRole.admin, tenant)
    teacher = _user(db, f"teacher@{slug}.com", UserRole.teacher, tenant)
    student = _user(db, f"student@{slug}.com", UserRole.student, tenant)

    lang = Language(name="Inglés", tenant_id=tenant.id)
    db.add(lang)
    db.flush()
    level = Level(language_id=lang.id, code="B1", name="B1")
    db.add(level)
    db.flush()

    course = Course(
        tenant_id=tenant.id,
        level_id=level.id,
        name="Inglés B1 Avanzado",
        max_students=20,
        status=CourseStatus.open,
        start_date=TODAY,
        end_date=TODAY + timedelta(days=90),
    )
    db.add(course)
    db.flush()

    db.add(CourseTeacher(course_id=course.id, teacher_id=teacher.id))

    enrollment = Enrollment(
        student_id=student.id,
        course_id=course.id,
        enrollment_code=next_enrollment_code(db, year=TODAY.year, tenant_id=tenant.id),
        status=EnrollmentStatus.active,
    )
    db.add(enrollment)
    db.commit()

    return tenant, superadmin, admin, teacher, student, course


def test_ludi_addon_request_and_activation_flow(client: TestClient, db: Session):
    tenant, superadmin, admin, teacher, student, _ = _setup_academy(db, "addon-flow")

    # 1. Alumno o profesor no pueden solicitar el add-on
    r_student = client.post(
        "/ludi/addon/request",
        json={"modules": ["voice", "tutor"]},
        headers=auth(client, student.email),
    )
    assert r_student.status_code == 403

    # 2. Director solicita el paquete Ludi
    r_admin = client.post(
        "/ludi/addon/request",
        json={"modules": ["lessons", "tutor", "voice", "live", "gamification"]},
        headers=auth(client, admin.email),
    )
    assert r_admin.status_code == 200
    data = r_admin.json()
    assert data["ludi_requested"] is True
    assert "gamification" in data["modules"]

    # 3. Superadmin activa el paquete para la academia
    r_activate = client.post(
        f"/ludi/tenants/{tenant.id}/activate",
        json={"enabled": True, "modules": ["voice", "tutor", "live", "gamification"]},
        headers=auth(client, superadmin.email),
    )
    assert r_activate.status_code == 200
    res_data = r_activate.json()
    assert res_data["has_ludi_addon"] is True
    assert "voice" in res_data["ludi_modules"]

    db.refresh(tenant)
    assert tenant.has_ludi_addon is True
    assert tenant.ludi_requested is False


def test_guard_refuses_when_ludi_not_active(client: TestClient, db: Session):
    tenant, _, admin, teacher, student, course = _setup_academy(db, "guard-flow")
    tenant.has_ludi_addon = False
    db.commit()

    # Intento de pronunciación cuando la academia no tiene activo Ludi
    res = client.post(
        "/ludi/practice/pronunciation",
        json={
            "course_id": course.id,
            "audio_base64": "UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=",
            "reference_text": "Hello world",
        },
        headers=auth(client, student.email),
    )
    assert res.status_code == 403
    assert "no tiene activo el paquete Ludi" in res.json()["detail"]


def test_pronunciation_practice_with_mocked_ludi(client: TestClient, db: Session):
    tenant, _, admin, teacher, student, course = _setup_academy(db, "pron-flow")
    tenant.has_ludi_addon = True
    tenant.ludi_modules = ["voice", "tutor", "live", "gamification"]
    db.commit()

    mock_ludi_response = {
        "accuracy_score": 92.5,
        "fluency_score": 88.0,
        "completeness_score": 100.0,
        "prosody_score": 90.0,
        "pronunciation_score": 91.2,
        "words": [
            {"word": "hello", "accuracy_score": 95.0, "error_type": "None"},
            {"word": "world", "accuracy_score": 90.0, "error_type": "None"},
        ],
    }

    with patch("app.services.ludi.LudiClient._request", return_value=mock_ludi_response) as mock_req:
        res = client.post(
            "/ludi/practice/pronunciation",
            json={
                "course_id": course.id,
                "audio_base64": "UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=",
                "reference_text": "Hello world",
                "language": "en-US",
            },
            headers=auth(client, student.email),
        )
        assert res.status_code == 200
        payload = res.json()
        assert payload["accuracy_score"] == 92.5
        assert payload["fluency_score"] == 88.0
        assert len(payload["words"]) == 2

        # Verificar que Ludi recibió el prefijo ext:t_{tenant_id}_c_{course_id}
        mock_req.assert_called_once()
        args, kwargs = mock_req.call_args
        assert args[0] == "POST"
        assert f"/courses/ext:t_{tenant.id}_c_{course.id}/voice:assess" in args[1]


def test_tutor_chat_with_mocked_ludi(client: TestClient, db: Session):
    tenant, _, admin, teacher, student, course = _setup_academy(db, "tutor-flow")
    tenant.has_ludi_addon = True
    tenant.ludi_modules = ["voice", "tutor", "live", "gamification"]
    db.commit()

    mock_tutor_reply = {
        "reply": "En Present Perfect usamos 'have/has' seguido del participio pasado.",
    }

    with patch("app.services.ludi.LudiClient._request", return_value=mock_tutor_reply) as mock_req:
        res = client.post(
            "/ludi/tutor/chat",
            json={
                "course_id": course.id,
                "message": "¿Cómo se usa el Present Perfect?",
            },
            headers=auth(client, student.email),
        )
        assert res.status_code == 200
        data = res.json()
        assert "participio pasado" in data["reply"]
        mock_req.assert_called_once()


def test_quiz_generation_and_live_session(client: TestClient, db: Session):
    tenant, _, admin, teacher, student, course = _setup_academy(db, "quiz-flow")
    tenant.has_ludi_addon = True
    tenant.ludi_modules = ["live"]
    db.commit()

    # 1. Alumno no puede generar quiz
    res_st = client.post(
        f"/ludi/courses/{course.id}/quizzes/generate",
        json={"course_id": course.id, "topic": "Past Simple", "questions": 5},
        headers=auth(client, student.email),
    )
    assert res_st.status_code == 403

    # 2. Profesor genera quiz con IA
    mock_quiz_res = {
        "quiz_id": "qz_12345",
        "title": "Past Simple Quiz",
        "questions_count": 5,
    }
    with patch("app.services.ludi.LudiClient._request", return_value=mock_quiz_res):
        res_prof = client.post(
            f"/ludi/courses/{course.id}/quizzes/generate",
            json={"course_id": course.id, "topic": "Past Simple", "questions": 5},
            headers=auth(client, teacher.email),
        )
        assert res_prof.status_code == 200
        assert res_prof.json()["quiz_id"] == "qz_12345"

    # 3. Profesor abre partida en vivo tipo Kahoot con PIN
    mock_live_session = {
        "session_id": "sess_abc999",
        "pin": "481920",
        "status": "waiting",
    }
    with patch("app.services.ludi.LudiClient._request", return_value=mock_live_session):
        res_live = client.post(
            "/ludi/quizzes/live-session",
            json={"quiz_id": "qz_12345"},
            headers=auth(client, teacher.email),
        )
        assert res_live.status_code == 200
        assert res_live.json()["pin"] == "481920"


def test_gamification_xp_and_leaderboard(client: TestClient, db: Session):
    tenant, _, admin, teacher, student, course = _setup_academy(db, "gamif-flow")
    tenant.has_ludi_addon = True
    tenant.ludi_modules = ["gamification"]
    db.commit()

    # Otorgar XP al estudiante
    mock_xp_res = {"status": "ok", "total_xp": 250}
    with patch("app.services.ludi.LudiClient._request", return_value=mock_xp_res):
        res_xp = client.post(
            "/ludi/xp",
            json={
                "course_id": course.id,
                "student_id": student.id,
                "amount": 100,
                "source": "homework_perfect_score",
            },
            headers=auth(client, teacher.email),
        )
        assert res_xp.status_code == 200

    # Consultar Leaderboard mapeado
    mock_ranking = [
        {"external_id": f"ext:t_{tenant.id}_u_{student.id}", "xp": 250, "rank": 1}
    ]
    with patch("app.services.ludi.LudiClient._request", return_value=mock_ranking):
        res_rank = client.get(
            f"/ludi/courses/{course.id}/ranking",
            headers=auth(client, student.email),
        )
        assert res_rank.status_code == 200
        entries = res_rank.json()
        assert len(entries) == 1
        assert entries[0]["student_id"] == student.id
        assert entries[0]["student_name"] == student.full_name
        assert entries[0]["xp"] == 250
        assert entries[0]["rank"] == 1
