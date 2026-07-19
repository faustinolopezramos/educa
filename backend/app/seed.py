"""Seed the database with an initial admin, base catalog and demo data.

Run with:  python -m app.seed
Idempotent: re-running will not duplicate rows.
"""

from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import SessionLocal
from app.core.security import hash_password
from app.models import (
    Course,
    CourseTeacher,
    Enrollment,
    Language,
    Level,
    MeetingProvider,
    Modality,
    ProviderName,
    Room,
    Schedule,
    TeacherAvailability,
    TeacherLanguage,
    User,
    UserRole,
    VirtualMeeting,
)


def _get_or_create_user(
    db: Session, email: str, full_name: str, role: UserRole, password: str
) -> User:
    user = db.scalar(select(User).where(User.email == email))
    if user is None:
        user = User(
            email=email,
            full_name=full_name,
            role=role,
            password_hash=hash_password(password),
        )
        db.add(user)
        db.flush()
    return user


def seed() -> None:
    db = SessionLocal()
    try:
        # --- Admin ---
        _get_or_create_user(
            db,
            settings.seed_admin_email,
            settings.seed_admin_name,
            UserRole.admin,
            settings.seed_admin_password,
        )

        # --- Demo teacher & student ---
        teacher = _get_or_create_user(
            db, "teacher@educa.com", "Profesor Demo", UserRole.teacher, "teacher123"
        )
        student = _get_or_create_user(
            db, "student@educa.com", "Alumno Demo", UserRole.student, "student123"
        )

        # --- Providers (manual active by default) ---
        for name in ProviderName:
            existing = db.scalar(
                select(MeetingProvider).where(MeetingProvider.name == name)
            )
            if existing is None:
                db.add(
                    MeetingProvider(
                        name=name, is_active=(name == ProviderName.manual)
                    )
                )

        # --- Catalog: language / level / course ---
        english = db.scalar(select(Language).where(Language.name == "Inglés"))
        if english is None:
            english = Language(name="Inglés")
            db.add(english)
            db.flush()

        level_a1 = db.scalar(
            select(Level).where(Level.language_id == english.id, Level.code == "A1")
        )
        if level_a1 is None:
            level_a1 = Level(language_id=english.id, code="A1", name="Principiante A1")
            db.add(level_a1)
            db.flush()

        course = db.scalar(
            select(Course).where(Course.name == "Inglés A1 - Mañanas")
        )
        if course is None:
            course = Course(
                level_id=level_a1.id,
                name="Inglés A1 - Mañanas",
                start_date=date.today(),
                end_date=date.today() + timedelta(days=90),
                max_students=15,
            )
            db.add(course)
            db.flush()

        # --- Room ---
        room = db.scalar(select(Room).where(Room.name == "Aula 101"))
        if room is None:
            room = Room(name="Aula 101", capacity=20, is_virtual=False)
            db.add(room)
            db.flush()

        # --- Teacher qualification & availability (demo) ---
        if (
            db.scalar(
                select(TeacherLanguage).where(
                    TeacherLanguage.teacher_id == teacher.id,
                    TeacherLanguage.language_id == english.id,
                )
            )
            is None
        ):
            db.add(TeacherLanguage(teacher_id=teacher.id, language_id=english.id))
        if (
            db.scalar(
                select(TeacherAvailability).where(
                    TeacherAvailability.teacher_id == teacher.id
                )
            )
            is None
        ):
            db.add(
                TeacherAvailability(
                    teacher_id=teacher.id,
                    day_of_week=0,
                    start_time=time(8, 0),
                    end_time=time(14, 0),
                )
            )

        # --- Assign the teacher to the course (prerequisite for scheduling) ---
        if (
            db.scalar(
                select(CourseTeacher).where(
                    CourseTeacher.course_id == course.id,
                    CourseTeacher.teacher_id == teacher.id,
                )
            )
            is None
        ):
            db.add(
                CourseTeacher(
                    course_id=course.id, teacher_id=teacher.id, is_lead=True
                )
            )
            db.flush()

        # --- Schedule (Mon 09:00-10:30) ---
        schedule = db.scalar(
            select(Schedule).where(
                Schedule.course_id == course.id, Schedule.teacher_id == teacher.id
            )
        )
        if schedule is None:
            schedule = Schedule(
                course_id=course.id,
                teacher_id=teacher.id,
                room_id=room.id,
                day_of_week=0,
                start_time=time(9, 0),
                end_time=time(10, 30),
                term_start=course.start_date,
                term_end=course.end_date,
                # A virtual class with a fixed link reused for every session.
                modality=Modality.virtual,
                provider=ProviderName.manual,
                join_url="https://example.com/demo-meeting",
            )
            db.add(schedule)
            db.flush()

        # --- Class sessions for the term (one per Monday) ---
        from app.services.sessions import generate_sessions

        generate_sessions(db, schedule)

        # --- Enrollment ---
        enrollment = db.scalar(
            select(Enrollment).where(
                Enrollment.student_id == student.id,
                Enrollment.course_id == course.id,
            )
        )
        if enrollment is None:
            db.add(Enrollment(student_id=student.id, course_id=course.id))

        # --- A demo virtual meeting on the next schedule session (manual provider) ---
        manual = db.scalar(
            select(MeetingProvider).where(MeetingProvider.name == ProviderName.manual)
        )
        existing_meeting = db.scalar(
            select(VirtualMeeting).where(VirtualMeeting.schedule_id == schedule.id)
        )
        if existing_meeting is None and manual is not None:
            from app.models import ClassSession

            next_session = (
                db.query(ClassSession)
                .filter(
                    ClassSession.schedule_id == schedule.id,
                    ClassSession.date >= date.today(),
                    ClassSession.status == "scheduled",
                )
                .order_by(ClassSession.date)
                .first()
            )
            session_date = next_session.date if next_session else date.today()
            start = datetime.combine(
                session_date,
                schedule.start_time,
                tzinfo=timezone.utc,
            )
            db.add(
                VirtualMeeting(
                    schedule_id=schedule.id,
                    provider_id=manual.id,
                    join_url="https://example.com/demo-meeting",
                    host_url="https://example.com/demo-meeting?host=1",
                    start_time=start,
                    end_time=start + timedelta(minutes=90),
                )
            )

        db.commit()
        print("Seed completed.")
        print(f"  Admin:   {settings.seed_admin_email} / {settings.seed_admin_password}")
        print("  Teacher: teacher@educa.com / teacher123")
        print("  Student: student@educa.com / student123")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
