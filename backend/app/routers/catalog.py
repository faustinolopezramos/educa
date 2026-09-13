from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import (
    student_course_ids,
    apply_tenant,
    get_current_user,
    in_tenant,
    require_permission,
    require_role,
    require_staff_permission,
    teacher_teaches_course,
)
from app.core.http import commit_or_conflict
from app.models import (
    COURSE_IS_ARCHIVED,
    ENROLLMENT_OCCUPIES_SEAT,
    Course,
    CourseTeacher,
    Enrollment,
    Language,
    Level,
    Nationality,
    Permission,
    Schedule,
    User,
    UserRole,
)
from app.models import (
    ClassSession,
    Attendance,
    Grade,
    Certificate,
    Payment,
    Invoice,
)
from app.schemas.catalog import (
    CourseCreate,
    CourseRead,
    CourseStatusChange,
    CourseUpdate,
    LanguageCreate,
    LanguageRead,
    LanguageUpdate,
    LevelCreate,
    LevelRead,
    LevelUpdate,
    NationalityCreate,
    NationalityRead,
    NationalityUpdate,
    DeleteImpact,
)
from app.schemas.teacher import CourseTeacherAssign, CourseTeacherRead
from app.schemas.user import UserBrief
from app.services.audit import record, snapshot
from app.services.courses import attach_course_stats, check_transition
from app.services.enrollments import seats_taken
from app.services.scheduling import teacher_qualified_for_course

router = APIRouter(prefix="/catalog", tags=["catalog"])

admin_only = require_permission(Permission.manage_catalog)
teacher_mgmt_only = require_permission(Permission.manage_teachers)
staff_only = require_staff_permission(Permission.manage_catalog)
# The nationality list is installation-wide, not one academy's data, so editing
# it is not an academy admin's call: a rename or a delete there lands on every
# other academy's student records (`users.nationality_id` is ON DELETE SET NULL).
superadmin_only = require_role(UserRole.superadmin)


# ---------------- Tenant-scoped lookups ----------------
# Each academy runs its own catalog. `Language` and `Course` carry a tenant of
# their own; a `Level` inherits its academy from the language above it, so it is
# scoped by joining rather than by a column of its own.
def _language_or_404(db: Session, user: User, language_id: int) -> Language:
    lang = db.get(Language, language_id)
    if not in_tenant(user, lang):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Language not found")
    return lang


def _level_or_404(db: Session, user: User, level_id: int) -> Level:
    level = db.get(Level, level_id)
    if level is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Level not found")
    _language_or_404(db, user, level.language_id)
    return level


def _course_or_404(db: Session, user: User, course_id: int) -> Course:
    course = db.get(Course, course_id)
    if not in_tenant(user, course):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Course not found")
    return course


# ---------------- Nationalities ----------------
# Deliberately *not* tenant-scoped: this is a list of countries, the same for
# every academy, not a piece of any one academy's data.
@router.get("/nationalities", response_model=list[NationalityRead])
def list_nationalities(
    db: Session = Depends(get_db), _: User = Depends(get_current_user)
) -> list[Nationality]:
    return list(db.scalars(select(Nationality)).all())


@router.post(
    "/nationalities",
    response_model=NationalityRead,
    status_code=status.HTTP_201_CREATED,
)
def create_nationality(
    payload: NationalityCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(superadmin_only),
) -> Nationality:
    nationality = Nationality(name=payload.name)
    db.add(nationality)
    db.flush()
    record(
        db,
        current_user,
        "create",
        "nationality",
        nationality.id,
        after=snapshot(nationality),
    )
    db.commit()
    db.refresh(nationality)
    return nationality


@router.patch("/nationalities/{nationality_id}", response_model=NationalityRead)
def update_nationality(
    nationality_id: int,
    payload: NationalityUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(superadmin_only),
) -> Nationality:
    nationality = db.get(Nationality, nationality_id)
    if nationality is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Nationality not found")
    before = snapshot(nationality)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(nationality, field, value)
    record(
        db,
        current_user,
        "update",
        "nationality",
        nationality.id,
        before=before,
        after=snapshot(nationality),
    )
    db.commit()
    db.refresh(nationality)
    return nationality


@router.delete(
    "/nationalities/{nationality_id}", status_code=status.HTTP_204_NO_CONTENT
)
def delete_nationality(
    nationality_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(superadmin_only),
) -> None:
    nationality = db.get(Nationality, nationality_id)
    if nationality is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Nationality not found")
    before = snapshot(nationality)
    record(db, current_user, "delete", "nationality", nationality.id, before=before)
    db.delete(nationality)
    db.commit()


# ---------------- Languages ----------------
@router.get("/languages", response_model=list[LanguageRead])
def list_languages(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
) -> list[Language]:
    stmt = apply_tenant(select(Language), Language.tenant_id, current_user)
    return list(db.scalars(stmt).all())


@router.post(
    "/languages", response_model=LanguageRead, status_code=status.HTTP_201_CREATED
)
def create_language(
    payload: LanguageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(admin_only),
) -> Language:
    lang = Language(
        name=payload.name, kind=payload.kind, tenant_id=current_user.tenant_id
    )
    db.add(lang)
    db.flush()
    record(db, current_user, "create", "language", lang.id, after=snapshot(lang))
    db.commit()
    db.refresh(lang)
    return lang


@router.patch("/languages/{language_id}", response_model=LanguageRead)
def update_language(
    language_id: int,
    payload: LanguageUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(admin_only),
) -> Language:
    lang = _language_or_404(db, current_user, language_id)
    before = snapshot(lang)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(lang, field, value)
    record(
        db,
        current_user,
        "update",
        "language",
        lang.id,
        before=before,
        after=snapshot(lang),
    )
    db.commit()
    db.refresh(lang)
    return lang


@router.delete("/languages/{language_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_language(
    language_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(admin_only),
) -> None:
    lang = _language_or_404(db, current_user, language_id)
    # Top of the same cascade: language → levels → courses → enrollments.
    levels = db.scalar(
        select(func.count()).select_from(Level).where(Level.language_id == language_id)
    )
    if levels:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            {
                "message": (
                    f"El idioma tiene {levels} nivel(es); elimínalos antes de "
                    "borrar el idioma."
                ),
                "reason": "has_levels",
            },
        )
    before = snapshot(lang)
    record(db, current_user, "delete", "language", lang.id, before=before)
    db.delete(lang)
    db.commit()


@router.get("/languages/{language_id}/delete-impact", response_model=DeleteImpact)
def language_delete_impact(
    language_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(admin_only),
) -> DeleteImpact:
    """Assess the cascade impact of deleting a language."""
    lang = _language_or_404(db, current_user, language_id)
    
    # Count levels
    levels_count = db.scalar(
        select(func.count()).select_from(Level).where(Level.language_id == language_id)
    ) or 0
    
    if levels_count == 0:
        return DeleteImpact(
            can_delete=True,
            message="El idioma no tiene niveles. Se puede eliminar sin impacto.",
            levels_count=0,
        )
    
    # Get level IDs for this language
    level_ids = db.scalars(
        select(Level.id).where(Level.language_id == language_id)
    ).all()
    
    # Count courses in those levels
    courses_count = db.scalar(
        select(func.count()).select_from(Course).where(Course.level_id.in_(level_ids))
    ) or 0
    
    if courses_count == 0:
        return DeleteImpact(
            can_delete=True,
            message=f"El idioma tiene {levels_count} nivel(es) pero sin cursos. Se eliminarán {levels_count} nivel(es).",
            levels_count=levels_count,
            courses_count=0,
        )
    
    # Get course IDs
    course_ids = db.scalars(
        select(Course.id).where(Course.level_id.in_(level_ids))
    ).all()
    
    # Count enrollments
    enrollments_count = db.scalar(
        select(func.count()).select_from(Enrollment).where(Enrollment.course_id.in_(course_ids))
    ) or 0
    
    # Count attendance (join through sessions)
    attendance_count = db.scalar(
        select(func.count())
        .select_from(Attendance)
        .join(ClassSession, Attendance.session_id == ClassSession.id)
        .join(Schedule, ClassSession.schedule_id == Schedule.id)
        .where(Schedule.course_id.in_(course_ids))
    ) or 0
    
    # Count grades
    grades_count = db.scalar(
        select(func.count())
        .select_from(Grade)
        .join(Enrollment, Grade.enrollment_id == Enrollment.id)
        .where(Enrollment.course_id.in_(course_ids))
    ) or 0
    
    # Count certificates
    certificates_count = db.scalar(
        select(func.count())
        .select_from(Certificate)
        .join(Enrollment, Certificate.enrollment_id == Enrollment.id)
        .where(Enrollment.course_id.in_(course_ids))
    ) or 0
    
    # Count payments
    payments_count = db.scalar(
        select(func.count())
        .select_from(Payment)
        .join(Enrollment, Payment.enrollment_id == Enrollment.id)
        .where(Enrollment.course_id.in_(course_ids))
    ) or 0
    
    # Count invoices
    invoices_count = db.scalar(
        select(func.count())
        .select_from(Invoice)
        .join(Enrollment, Invoice.enrollment_id == Enrollment.id)
        .where(Enrollment.course_id.in_(course_ids))
    ) or 0
    
    return DeleteImpact(
        can_delete=False,
        reason="has_levels",
        levels_count=levels_count,
        courses_count=courses_count,
        enrollments_count=enrollments_count,
        attendance_count=attendance_count,
        grades_count=grades_count,
        certificates_count=certificates_count,
        payments_count=payments_count,
        invoices_count=invoices_count,
        message=(
            f"Eliminar este idioma borrará en cascada: {levels_count} nivel(es), "
            f"{courses_count} curso(s), {enrollments_count} matrícula(s), "
            f"{attendance_count} registro(s) de asistencia, {grades_count} nota(s), "
            f"{certificates_count} certificado(s), {payments_count} pago(s), "
            f"{invoices_count} factura(s). Esta acción es irreversible."
        ),
    )


@router.get("/levels/{level_id}/delete-impact", response_model=DeleteImpact)
def level_delete_impact(
    level_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(admin_only),
) -> DeleteImpact:
    """Assess the cascade impact of deleting a level."""
    level = _level_or_404(db, current_user, level_id)
    
    # Count courses in this level
    courses_count = db.scalar(
        select(func.count()).select_from(Course).where(Course.level_id == level_id)
    ) or 0
    
    if courses_count == 0:
        return DeleteImpact(
            can_delete=True,
            message="El nivel no tiene cursos. Se puede eliminar sin impacto.",
            levels_count=0,
            courses_count=0,
        )
    
    # Get course IDs
    course_ids = db.scalars(
        select(Course.id).where(Course.level_id == level_id)
    ).all()
    
    # Count enrollments
    enrollments_count = db.scalar(
        select(func.count()).select_from(Enrollment).where(Enrollment.course_id.in_(course_ids))
    ) or 0
    
    # Count attendance
    attendance_count = db.scalar(
        select(func.count())
        .select_from(Attendance)
        .join(ClassSession, Attendance.session_id == ClassSession.id)
        .join(Schedule, ClassSession.schedule_id == Schedule.id)
        .where(Schedule.course_id.in_(course_ids))
    ) or 0
    
    # Count grades
    grades_count = db.scalar(
        select(func.count())
        .select_from(Grade)
        .join(Enrollment, Grade.enrollment_id == Enrollment.id)
        .where(Enrollment.course_id.in_(course_ids))
    ) or 0
    
    # Count certificates
    certificates_count = db.scalar(
        select(func.count())
        .select_from(Certificate)
        .join(Enrollment, Certificate.enrollment_id == Enrollment.id)
        .where(Enrollment.course_id.in_(course_ids))
    ) or 0
    
    # Count payments
    payments_count = db.scalar(
        select(func.count())
        .select_from(Payment)
        .join(Enrollment, Payment.enrollment_id == Enrollment.id)
        .where(Enrollment.course_id.in_(course_ids))
    ) or 0
    
    # Count invoices
    invoices_count = db.scalar(
        select(func.count())
        .select_from(Invoice)
        .join(Enrollment, Invoice.enrollment_id == Enrollment.id)
        .where(Enrollment.course_id.in_(course_ids))
    ) or 0
    
    return DeleteImpact(
        can_delete=False,
        reason="has_courses",
        courses_count=courses_count,
        enrollments_count=enrollments_count,
        attendance_count=attendance_count,
        grades_count=grades_count,
        certificates_count=certificates_count,
        payments_count=payments_count,
        invoices_count=invoices_count,
        message=(
            f"Eliminar este nivel borrará en cascada: {courses_count} curso(s), "
            f"{enrollments_count} matrícula(s), {attendance_count} registro(s) de asistencia, "
            f"{grades_count} nota(s), {certificates_count} certificado(s), "
            f"{payments_count} pago(s), {invoices_count} factura(s). "
            "Esta acción es irreversible."
        ),
    )


@router.get("/courses/{course_id}/delete-impact", response_model=DeleteImpact)
def course_delete_impact(
    course_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(admin_only),
) -> DeleteImpact:
    """Assess the cascade impact of deleting a course."""
    course = _course_or_404(db, current_user, course_id)
    
    # Count enrollments
    enrollments_count = db.scalar(
        select(func.count()).select_from(Enrollment).where(Enrollment.course_id == course_id)
    ) or 0
    
    if enrollments_count == 0:
        return DeleteImpact(
            can_delete=True,
            message="El curso no tiene matrículas. Se puede eliminar sin impacto.",
        )
    
    # Count attendance
    attendance_count = db.scalar(
        select(func.count())
        .select_from(Attendance)
        .join(ClassSession, Attendance.session_id == ClassSession.id)
        .join(Schedule, ClassSession.schedule_id == Schedule.id)
        .where(Schedule.course_id == course_id)
    ) or 0
    
    # Count grades
    grades_count = db.scalar(
        select(func.count())
        .select_from(Grade)
        .join(Enrollment, Grade.enrollment_id == Enrollment.id)
        .where(Enrollment.course_id == course_id)
    ) or 0
    
    # Count certificates
    certificates_count = db.scalar(
        select(func.count())
        .select_from(Certificate)
        .join(Enrollment, Certificate.enrollment_id == Enrollment.id)
        .where(Enrollment.course_id == course_id)
    ) or 0
    
    # Count payments
    payments_count = db.scalar(
        select(func.count())
        .select_from(Payment)
        .join(Enrollment, Payment.enrollment_id == Enrollment.id)
        .where(Enrollment.course_id == course_id)
    ) or 0
    
    # Count invoices
    invoices_count = db.scalar(
        select(func.count())
        .select_from(Invoice)
        .join(Enrollment, Invoice.enrollment_id == Enrollment.id)
        .where(Enrollment.course_id == course_id)
    ) or 0
    
    return DeleteImpact(
        can_delete=False,
        reason="has_enrollments",
        enrollments_count=enrollments_count,
        attendance_count=attendance_count,
        grades_count=grades_count,
        certificates_count=certificates_count,
        payments_count=payments_count,
        invoices_count=invoices_count,
        message=(
            f"Eliminar este curso borrará en cascada: {enrollments_count} matrícula(s), "
            f"{attendance_count} registro(s) de asistencia, {grades_count} nota(s), "
            f"{certificates_count} certificado(s), {payments_count} pago(s), "
            f"{invoices_count} factura(s). Esta acción es irreversible."
        ),
    )


# ---------------- Levels ----------------
@router.get("/levels", response_model=list[LevelRead])
def list_levels(
    language_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[Level]:
    # A level has no tenant of its own: it belongs to whichever academy owns the
    # language above it, so the scope comes from that join.
    stmt = apply_tenant(
        select(Level).join(Language, Level.language_id == Language.id),
        Language.tenant_id,
        current_user,
    )
    if language_id is not None:
        stmt = stmt.where(Level.language_id == language_id)
    return list(db.scalars(stmt).all())


@router.post("/levels", response_model=LevelRead, status_code=status.HTTP_201_CREATED)
def create_level(
    payload: LevelCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(admin_only),
) -> Level:
    _language_or_404(db, current_user, payload.language_id)
    level = Level(**payload.model_dump())
    db.add(level)
    db.flush()
    record(db, current_user, "create", "level", level.id, after=snapshot(level))
    db.commit()
    db.refresh(level)
    return level


@router.patch("/levels/{level_id}", response_model=LevelRead)
def update_level(
    level_id: int,
    payload: LevelUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(admin_only),
) -> Level:
    level = _level_or_404(db, current_user, level_id)
    before = snapshot(level)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(level, field, value)
    record(
        db,
        current_user,
        "update",
        "level",
        level.id,
        before=before,
        after=snapshot(level),
    )
    db.commit()
    db.refresh(level)
    return level


@router.delete("/levels/{level_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_level(
    level_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(admin_only),
) -> None:
    level = _level_or_404(db, current_user, level_id)
    # Same cascade as `delete_course`, one rung higher: level → courses →
    # enrollments → the academic and financial history underneath them.
    courses = db.scalar(
        select(func.count()).select_from(Course).where(Course.level_id == level_id)
    )
    if courses:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            {
                "message": (
                    f"El nivel tiene {courses} curso(s); elimínalos antes de "
                    "borrar el nivel."
                ),
                "reason": "has_courses",
            },
        )
    before = snapshot(level)
    record(db, current_user, "delete", "level", level.id, before=before)
    db.delete(level)
    db.commit()


# ---------------- Courses ----------------
@router.get("/courses", response_model=list[CourseRead])
def list_courses(
    level_id: int | None = None,
    status_in: str | None = None,
    include_archived: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[CourseRead]:
    """The academy's courses, with the numbers the course list is built from.

    Archived courses are kept out unless asked for: they exist for the record,
    and leaving them in the default list makes the catalog grow forever with
    things nobody can act on.
    """
    stmt = apply_tenant(select(Course), Course.tenant_id, current_user)
    if level_id is not None:
        stmt = stmt.where(Course.level_id == level_id)
    if status_in:
        wanted = [s.strip() for s in status_in.split(",") if s.strip()]
        stmt = stmt.where(Course.status.in_(wanted))
    elif not include_archived:
        stmt = stmt.where(Course.status.notin_(COURSE_IS_ARCHIVED))
    # A student only ever sees courses they can actually reach.
    if current_user.role == UserRole.student:
        stmt = stmt.where(Course.id.in_(student_course_ids(db, current_user.id) or [-1]))
    return attach_course_stats(db, db.scalars(stmt).all())


@router.post("/courses/{course_id}/status", response_model=CourseRead)
def change_course_status(
    course_id: int,
    payload: CourseStatusChange,
    db: Session = Depends(get_db),
    current_user: User = Depends(admin_only),
) -> CourseRead:
    """Move a course through its lifecycle, if the move has been earned.

    Deliberately its own endpoint rather than a field on `PATCH /courses/{id}`:
    every move here has prerequisites, and a generic patch would route around
    all of them.
    """
    course = _course_or_404(db, current_user, course_id)
    refusal = check_transition(db, course, payload.status)
    if refusal is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "reason": refusal.reason,
                "message": refusal.message,
                "blockers": refusal.blockers,
                "from": course.status.value,
                "to": payload.status.value,
            },
        )
    before = snapshot(course)
    course.status = payload.status
    record(
        db,
        current_user,
        "status_change",
        "course",
        course.id,
        before=before,
        after=snapshot(course),
    )
    db.commit()
    db.refresh(course)
    return attach_course_stats(db, [course])[0]


@router.post("/courses", response_model=CourseRead, status_code=status.HTTP_201_CREATED)
def create_course(
    payload: CourseCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(admin_only),
) -> Course:
    _level_or_404(db, current_user, payload.level_id)
    course = Course(**payload.model_dump(), tenant_id=current_user.tenant_id)
    db.add(course)
    db.flush()
    record(db, current_user, "create", "course", course.id, after=snapshot(course))
    db.commit()
    db.refresh(course)
    return course


@router.patch("/courses/{course_id}", response_model=CourseRead)
def update_course(
    course_id: int,
    payload: CourseUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(admin_only),
) -> Course:
    course = _course_or_404(db, current_user, course_id)
    before = snapshot(course)
    data = payload.model_dump(exclude_unset=True)

    # Capacity is a promise to the students already in the room: it may grow
    # freely, but it cannot be cut below the seats currently taken.
    if data.get("max_students") is not None:
        active_count = seats_taken(db, course_id)
        if data["max_students"] < active_count:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "message": (
                        f"El curso ya tiene {active_count} alumno(s) matriculado(s); "
                        f"el cupo no puede bajar de esa cifra"
                    ),
                    "reason": "capacity_below_enrolled",
                },
            )

    for field, value in data.items():
        setattr(course, field, value)
    # Keep the denormalized term on this course's schedules in sync so conflict
    # detection stays correct when a course's dates change.
    if "start_date" in data or "end_date" in data:
        for sched in db.scalars(
            select(Schedule).where(Schedule.course_id == course_id)
        ).all():
            sched.term_start = course.start_date
            sched.term_end = course.end_date
    record(
        db,
        current_user,
        "update",
        "course",
        course.id,
        before=before,
        after=snapshot(course),
    )
    # Widening a course's term can push its schedules into a clash with the
    # teacher's or room's other classes, which the exclusion constraint catches.
    commit_or_conflict(
        db,
        {
            "message": (
                "Las nuevas fechas hacen que un horario de este curso choque con "
                "otra clase del profesor o del aula"
            ),
            "reason": "term_conflict",
        },
    )
    db.refresh(course)
    return course


@router.get("/courses/{course_id}/students", response_model=list[UserBrief])
def list_course_students(
    course_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(staff_only),
) -> list[User]:
    """Roster of a course, so a teacher can put names next to enrollment rows.

    Scoped on purpose: teachers get the students of the courses they teach and
    nothing else. Only *active* enrollments count — someone who cancelled is no
    longer in the room to be marked or graded.
    """
    _course_or_404(db, current_user, course_id)
    if current_user.role == UserRole.teacher and not teacher_teaches_course(
        db, current_user.id, course_id
    ):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No enseñas este curso")
    return list(
        db.scalars(
            select(User)
            .join(Enrollment, Enrollment.student_id == User.id)
            .where(
                Enrollment.course_id == course_id,
                # The register lists whoever holds a seat, which is what the
                # teacher sees when taking attendance. Counting only `active`
                # left a student in "Inscrito" off the list of a class they were
                # nonetheless free to walk into.
                Enrollment.status.in_(ENROLLMENT_OCCUPIES_SEAT),
            )
            .order_by(User.full_name)
        ).all()
    )


# ---------------- Course ↔ teacher assignment ----------------
@router.get("/courses/{course_id}/teachers", response_model=list[CourseTeacherRead])
def list_course_teachers(
    course_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[CourseTeacherRead]:
    """Who is assigned to teach this course. Readable by any authenticated user
    (a student may want to know who teaches their course)."""
    _course_or_404(db, current_user, course_id)
    rows = db.scalars(
        select(CourseTeacher).where(CourseTeacher.course_id == course_id)
    ).all()
    return [
        CourseTeacherRead(
            id=r.id,
            course_id=r.course_id,
            teacher_id=r.teacher_id,
            is_lead=r.is_lead,
            teacher_name=teacher.full_name if teacher else f"#{r.teacher_id}",
        )
        for r, teacher in ((r, db.get(User, r.teacher_id)) for r in rows)
    ]


@router.post(
    "/courses/{course_id}/teachers",
    response_model=CourseTeacherRead,
    status_code=status.HTTP_201_CREATED,
)
def assign_course_teacher(
    course_id: int,
    payload: CourseTeacherAssign,
    db: Session = Depends(get_db),
    current_user: User = Depends(teacher_mgmt_only),
) -> CourseTeacherRead:
    _course_or_404(db, current_user, course_id)
    teacher = db.get(User, payload.teacher_id)
    if not in_tenant(current_user, teacher) or teacher.role != UserRole.teacher:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "teacher_id must be a teacher")
    if not teacher_qualified_for_course(db, teacher.id, course_id):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            {
                "message": "El profesor no está calificado para el idioma de este curso",
                "reason": "qualification",
            },
        )
    if db.scalar(
        select(CourseTeacher).where(
            CourseTeacher.course_id == course_id,
            CourseTeacher.teacher_id == teacher.id,
        )
    ):
        raise HTTPException(status.HTTP_409_CONFLICT, "El profesor ya está asignado")
    row = CourseTeacher(
        course_id=course_id, teacher_id=teacher.id, is_lead=payload.is_lead
    )
    db.add(row)
    db.flush()
    record(db, current_user, "create", "course_teacher", row.id, after=snapshot(row))
    db.commit()
    db.refresh(row)
    return CourseTeacherRead(
        id=row.id,
        course_id=row.course_id,
        teacher_id=row.teacher_id,
        is_lead=row.is_lead,
        teacher_name=teacher.full_name,
    )


@router.delete(
    "/courses/{course_id}/teachers/{teacher_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def unassign_course_teacher(
    course_id: int,
    teacher_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(teacher_mgmt_only),
) -> None:
    _course_or_404(db, current_user, course_id)
    row = db.scalar(
        select(CourseTeacher).where(
            CourseTeacher.course_id == course_id,
            CourseTeacher.teacher_id == teacher_id,
        )
    )
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Assignment not found")
    # A teacher cannot be dropped from a course while they still run a class in
    # it: those schedules would be left with an unassigned teacher.
    if db.scalar(
        select(Schedule.id).where(
            Schedule.course_id == course_id, Schedule.teacher_id == teacher_id
        )
    ):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "El profesor aún tiene horarios en este curso; reasígnalos antes de quitarlo.",
        )
    before = snapshot(row)
    record(db, current_user, "delete", "course_teacher", row.id, before=before)
    db.delete(row)
    db.commit()


@router.delete("/courses/{course_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_course(
    course_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(admin_only),
) -> None:
    course = _course_or_404(db, current_user, course_id)
    # Deleting a course cascades all the way down: enrollments, and with them
    # attendance, grades, certificates, payments and invoices. That is an
    # accounting record being destroyed, not a catalog entry being tidied up,
    # so a course anyone was ever enrolled in has to be emptied deliberately.
    enrolled = db.scalar(
        select(func.count())
        .select_from(Enrollment)
        .where(Enrollment.course_id == course_id)
    )
    if enrolled:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            {
                "message": (
                    f"El curso tiene {enrolled} matrícula(s) con su historial "
                    "académico y financiero; elimínalas antes de borrar el curso."
                ),
                "reason": "has_enrollments",
            },
        )
    before = snapshot(course)
    record(db, current_user, "delete", "course", course.id, before=before)
    db.delete(course)
    db.commit()
