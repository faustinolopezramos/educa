"""Seed the database with an initial admin, base catalog and rich demo data.

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
    Assignment,
    AssignmentSubmission,
    Course,
    CourseTeacher,
    Enrollment,
    Grade,
    Language,
    Level,
    MeetingProvider,
    Modality,
    Nationality,
    ProviderName,
    Room,
    Schedule,
    TeacherAvailability,
    TeacherLanguage,
    Tenant,
    TrackKind,
    User,
    UserRole,
    VirtualMeeting,
)
from app.services.sequences import next_enrollment_code

_NATIONALITIES = [
    "Colombia",
    "Venezuela",
    "Cuba",
    "Brasil",
    "Argentina",
    "Uruguay",
    "Chile",
    "Egipto",
    "Siria",
    "Líbano",
    "China",
    "Taiwán",
    "Guatemala",
]

_SKILL_TRACKS: dict[str, TrackKind] = {
    "Computación básica para adultos": TrackKind.digital_skill,
    "Marketing Digital": TrackKind.digital_skill,
    "Inteligencia Emocional": TrackKind.business_skill,
    "Emprendimiento": TrackKind.business_skill,
}


def _get_or_create_tenant(db: Session, name: str, slug: str) -> Tenant:
    tenant = db.scalar(select(Tenant).where(Tenant.slug == slug))
    if tenant is None:
        tenant = Tenant(name=name, slug=slug, max_active_students=100)
        db.add(tenant)
        db.flush()
    return tenant


def _get_or_create_user(
    db: Session,
    email: str,
    full_name: str,
    role: UserRole,
    password: str,
    tenant_id: int | None = None,
    phone: str | None = None,
) -> User:
    user = db.scalar(select(User).where(User.email == email))
    if user is None:
        user = User(
            email=email,
            full_name=full_name,
            role=role,
            password_hash=hash_password(password),
            tenant_id=tenant_id,
            phone=phone,
        )
        db.add(user)
        db.flush()
    return user


def seed() -> None:
    db = SessionLocal()
    try:
        # --- Tenant ---
        tenant = _get_or_create_tenant(db, "Academia Demo", "default")

        # --- SuperAdmin Global ---
        _get_or_create_user(
            db,
            "superadmin@educa.com",
            "SuperAdmin Global",
            UserRole.superadmin,
            "superadmin123",
            tenant_id=None,
        )

        # --- Admin ---
        admin = _get_or_create_user(
            db,
            settings.seed_admin_email,
            settings.seed_admin_name,
            UserRole.admin,
            settings.seed_admin_password,
            tenant_id=tenant.id,
        )

        # --- Demo teachers ---
        teacher1 = _get_or_create_user(
            db,
            "teacher@educa.com",
            "Prof. Roberto Mendoza",
            UserRole.teacher,
            "teacher123",
            tenant_id=tenant.id,
            phone="+502 5555-0101",
        )
        teacher2 = _get_or_create_user(
            db,
            "teacher2@educa.com",
            "Dra. Elena Ramos",
            UserRole.teacher,
            "teacher123",
            tenant_id=tenant.id,
            phone="+502 5555-0102",
        )

        # --- Demo students ---
        students_data = [
            ("student@educa.com", "Alumno Demo (Sofía Martínez)", "student123"),
            ("student2@educa.com", "Carlos Gómez", "student123"),
            ("student3@educa.com", "Mariana López", "student123"),
            ("student4@educa.com", "Alejandro Torres", "student123"),
            ("student5@educa.com", "Lucía Ramírez", "student123"),
        ]
        students: list[User] = []
        for email, name, pwd in students_data:
            st = _get_or_create_user(
                db, email, name, UserRole.student, pwd, tenant_id=tenant.id
            )
            students.append(st)

        # --- Providers ---
        for name in ProviderName:
            existing = db.scalar(
                select(MeetingProvider).where(MeetingProvider.name == name)
            )
            if existing is None:
                db.add(
                    MeetingProvider(name=name, is_active=(name == ProviderName.manual))
                )

        # --- Nationalities ---
        for name in _NATIONALITIES:
            if db.scalar(select(Nationality).where(Nationality.name == name)) is None:
                db.add(Nationality(name=name))
        db.flush()

        # --- Catalog ---
        english = db.scalar(select(Language).where(Language.name == "Inglés"))
        if english is None:
            english = Language(name="Inglés", kind=TrackKind.language)
            db.add(english)
            db.flush()

        spanish = db.scalar(select(Language).where(Language.name == "Español"))
        if spanish is None:
            db.add(Language(name="Español", kind=TrackKind.language))

        for track_name, kind in _SKILL_TRACKS.items():
            track = db.scalar(select(Language).where(Language.name == track_name))
            if track is None:
                track = Language(name=track_name, kind=kind)
                db.add(track)
                db.flush()
            for n in range(1, 5):
                code = f"M{n}"
                if (
                    db.scalar(
                        select(Level).where(
                            Level.language_id == track.id, Level.code == code
                        )
                    )
                    is None
                ):
                    db.add(Level(language_id=track.id, code=code, name=f"Módulo {n}"))
        db.flush()

        level_a1 = db.scalar(
            select(Level).where(Level.language_id == english.id, Level.code == "A1")
        )
        if level_a1 is None:
            level_a1 = Level(language_id=english.id, code="A1", name="Principiante A1")
            db.add(level_a1)
            db.flush()

        mkt_track = db.scalar(
            select(Language).where(Language.name == "Marketing Digital")
        )
        level_m1 = (
            db.scalar(
                select(Level).where(
                    Level.language_id == mkt_track.id, Level.code == "M1"
                )
            )
            if mkt_track
            else None
        )

        # --- Courses ---
        course1 = db.scalar(select(Course).where(Course.name == "Inglés A1 - Mañanas"))
        if course1 is None:
            course1 = Course(
                level_id=level_a1.id,
                name="Inglés A1 - Mañanas",
                start_date=date.today(),
                end_date=date.today() + timedelta(days=90),
                max_students=20,
            )
            db.add(course1)
            db.flush()

        course2 = None
        if level_m1:
            course2 = db.scalar(
                select(Course).where(Course.name == "Marketing Digital Módulo 1")
            )
            if course2 is None:
                course2 = Course(
                    level_id=level_m1.id,
                    name="Marketing Digital Módulo 1",
                    start_date=date.today(),
                    end_date=date.today() + timedelta(days=60),
                    max_students=15,
                )
                db.add(course2)
                db.flush()

        # --- Room ---
        room = db.scalar(select(Room).where(Room.name == "Aula 101"))
        if room is None:
            room = Room(name="Aula 101", capacity=25, is_virtual=False)
            db.add(room)
            db.flush()

        # --- Qualifications & Teacher Course Assignments ---
        for t in [teacher1, teacher2]:
            if (
                db.scalar(
                    select(TeacherLanguage).where(
                        TeacherLanguage.teacher_id == t.id,
                        TeacherLanguage.language_id == english.id,
                    )
                )
                is None
            ):
                db.add(TeacherLanguage(teacher_id=t.id, language_id=english.id))
            if (
                mkt_track
                and db.scalar(
                    select(TeacherLanguage).where(
                        TeacherLanguage.teacher_id == t.id,
                        TeacherLanguage.language_id == mkt_track.id,
                    )
                )
                is None
            ):
                db.add(TeacherLanguage(teacher_id=t.id, language_id=mkt_track.id))

        if (
            db.scalar(
                select(CourseTeacher).where(
                    CourseTeacher.course_id == course1.id,
                    CourseTeacher.teacher_id == teacher1.id,
                )
            )
            is None
        ):
            db.add(
                CourseTeacher(
                    course_id=course1.id, teacher_id=teacher1.id, is_lead=True
                )
            )

        if (
            course2
            and db.scalar(
                select(CourseTeacher).where(
                    CourseTeacher.course_id == course2.id,
                    CourseTeacher.teacher_id == teacher2.id,
                )
            )
            is None
        ):
            db.add(
                CourseTeacher(
                    course_id=course2.id, teacher_id=teacher2.id, is_lead=True
                )
            )
        db.flush()

        # --- Schedules ---
        schedule1 = db.scalar(
            select(Schedule).where(
                Schedule.course_id == course1.id, Schedule.teacher_id == teacher1.id
            )
        )
        if schedule1 is None:
            schedule1 = Schedule(
                course_id=course1.id,
                teacher_id=teacher1.id,
                room_id=room.id,
                day_of_week=0,
                start_time=time(9, 0),
                end_time=time(10, 30),
                term_start=course1.start_date,
                term_end=course1.end_date,
                modality=Modality.virtual,
                provider=ProviderName.manual,
                join_url="https://example.com/demo-english-class",
            )
            db.add(schedule1)
            db.flush()

        from app.services.sessions import generate_sessions

        generate_sessions(db, schedule1)

        # --- Enrollments ---
        for st in students:
            if (
                db.scalar(
                    select(Enrollment).where(
                        Enrollment.student_id == st.id,
                        Enrollment.course_id == course1.id,
                    )
                )
                is None
            ):
                db.add(
                    Enrollment(
                        student_id=st.id,
                        course_id=course1.id,
                        enrollment_code=next_enrollment_code(
                            db, year=date.today().year
                        ),
                    )
                )
            if (
                course2
                and db.scalar(
                    select(Enrollment).where(
                        Enrollment.student_id == st.id,
                        Enrollment.course_id == course2.id,
                    )
                )
                is None
            ):
                db.add(
                    Enrollment(
                        student_id=st.id,
                        course_id=course2.id,
                        enrollment_code=next_enrollment_code(
                            db, year=date.today().year
                        ),
                    )
                )
        db.flush()

        # --- Assignments (Tareas) & Submissions (Entregas) ---
        a1 = db.scalar(
            select(Assignment).where(
                Assignment.course_id == course1.id,
                Assignment.title == "Taller 1: Ensayo de Presentación",
            )
        )
        if a1 is None:
            a1 = Assignment(
                course_id=course1.id,
                tenant_id=tenant.id,
                title="Taller 1: Ensayo de Presentación",
                description="Escribir un texto corto de 150 palabras en inglés presentándote (nombre, profesión, pasatiempos y metas).",
                resource_url="https://drive.google.com/file/d/demo-guia-presentacion",
                due_date=datetime.now(timezone.utc) + timedelta(days=5),
            )
            db.add(a1)
            db.flush()

        a2 = db.scalar(
            select(Assignment).where(
                Assignment.course_id == course1.id,
                Assignment.title == "Ejercicio de Vocabulario y Pronunciación",
            )
        )
        if a2 is None:
            a2 = Assignment(
                course_id=course1.id,
                tenant_id=tenant.id,
                title="Ejercicio de Vocabulario y Pronunciación",
                description="Graba un audio o video de 1 minuto leyendo las oraciones de la guía de trabajo.",
                resource_url="https://drive.google.com/file/d/demo-audio-guide",
                due_date=datetime.now(timezone.utc) + timedelta(days=1),
            )
            db.add(a2)
            db.flush()

        if course2:
            a3 = db.scalar(
                select(Assignment).where(
                    Assignment.course_id == course2.id,
                    Assignment.title == "Caso de Estudio: Estrategia de Redes Sociales",
                )
            )
            if a3 is None:
                a3 = Assignment(
                    course_id=course2.id,
                    tenant_id=tenant.id,
                    title="Caso de Estudio: Estrategia de Redes Sociales",
                    description="Analizar la campaña digital de una marca local y proponer 3 mejoras clave.",
                    resource_url="https://drive.google.com/file/d/demo-mkt-case",
                    due_date=datetime.now(timezone.utc) + timedelta(days=3),
                )
                db.add(a3)
                db.flush()

        # --- Demo Submissions & Grades for Students ---
        st0_enrollment = db.scalar(
            select(Enrollment).where(
                Enrollment.student_id == students[0].id,
                Enrollment.course_id == course1.id,
            )
        )
        st1_enrollment = db.scalar(
            select(Enrollment).where(
                Enrollment.student_id == students[1].id,
                Enrollment.course_id == course1.id,
            )
        )

        if st0_enrollment and a1:
            sub0 = db.scalar(
                select(AssignmentSubmission).where(
                    AssignmentSubmission.assignment_id == a1.id,
                    AssignmentSubmission.student_id == students[0].id,
                )
            )
            if sub0 is None:
                db.add(
                    AssignmentSubmission(
                        assignment_id=a1.id,
                        student_id=students[0].id,
                        tenant_id=tenant.id,
                        content="Hello! My name is Sofía. I am learning English to expand my career goals.",
                        submission_url="https://github.com/sofia-martinez/essay-demo",
                        status="graded",
                        score=9.5,
                        feedback="¡Excelente trabajo! 👏 Estructura gramatical impecable.",
                    )
                )

        if st1_enrollment and a1:
            sub1 = db.scalar(
                select(AssignmentSubmission).where(
                    AssignmentSubmission.assignment_id == a1.id,
                    AssignmentSubmission.student_id == students[1].id,
                )
            )
            if sub1 is None:
                db.add(
                    AssignmentSubmission(
                        assignment_id=a1.id,
                        student_id=students[1].id,
                        tenant_id=tenant.id,
                        content="Hi, I am Carlos Gómez. I work in logistics and enjoy reading.",
                        submission_url="https://drive.google.com/carlos-essay",
                        status="submitted",
                        score=None,
                        feedback=None,
                    )
                )

        # Course level grades for report demo
        if st0_enrollment:
            g0 = db.scalar(
                select(Grade).where(
                    Grade.enrollment_id == st0_enrollment.id,
                    Grade.evaluation_name == "Examen Parcial",
                )
            )
            if g0 is None:
                db.add(
                    Grade(
                        enrollment_id=st0_enrollment.id,
                        evaluation_name="Examen Parcial",
                        score=9.0,
                    )
                )

        if st1_enrollment:
            g1 = db.scalar(
                select(Grade).where(
                    Grade.enrollment_id == st1_enrollment.id,
                    Grade.evaluation_name == "Examen Parcial",
                )
            )
            if g1 is None:
                db.add(
                    Grade(
                        enrollment_id=st1_enrollment.id,
                        evaluation_name="Examen Parcial",
                        score=8.5,
                    )
                )

        db.commit()
        print("Enriched Seed Completed Successfully.")
        print(
            f"  Admin:      {settings.seed_admin_email} / {settings.seed_admin_password}"
        )
        print("  Teacher 1:  teacher@educa.com / teacher123")
        print("  Teacher 2:  teacher2@educa.com / teacher123")
        print("  Students:   student@educa.com, student2@educa.com, etc. / student123")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
