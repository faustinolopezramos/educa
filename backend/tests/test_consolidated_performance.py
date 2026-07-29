from datetime import date

from app.core.security import hash_password
from app.models import Course, Language, Level, User, UserRole
from app.services.reports import build_report


def test_consolidated_performance_calculation(db):
    lang = Language(name="Lengua Test Perf")
    db.add(lang)
    db.flush()

    level = Level(language_id=lang.id, code="B1", name="Intermedio")
    db.add(level)
    db.flush()

    course = Course(level_id=level.id, name="Curso Perf 101")
    db.add(course)
    db.flush()

    admin = User(
        email="admin_perf@test.com",
        full_name="Admin Perf",
        role=UserRole.admin,
        password_hash=hash_password("secret123"),
    )
    db.add(admin)
    db.flush()

    rep = build_report(db, admin, "month", date.today(), course_id=course.id)
    assert hasattr(rep, "consolidated_students")
    assert isinstance(rep.consolidated_students, list)
