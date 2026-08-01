from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import (
    apply_tenant,
    enrollment_in_scope_or_404,
    get_current_user,
    require_staff_permission,
    student_is_solvent,
    teacher_course_ids,
    teacher_teaches_course,
)
from app.core.http import commit_or_conflict
from app.models import (
    ClassSession,
    Course,
    ENROLLMENT_OCCUPIES_SEAT,
    ENROLLMENT_STATUS_LABELS,
    Enrollment,
    Grade,
    Permission,
    Schedule,
    SessionStatus,
    User,
    UserRole,
)
from app.schemas.grade import GradeCreate, GradeRead, GradeUpdate
from app.services.audit import record, snapshot

router = APIRouter(prefix="/grades", tags=["grades"])

staff_only = require_staff_permission(Permission.manage_grades)


def _ensure_teacher_owns_enrollment(
    db: Session, user: User, enrollment: Enrollment
) -> None:
    """Teachers may only grade courses they teach."""
    if user.role == UserRole.teacher and not teacher_teaches_course(
        db, user.id, enrollment.course_id
    ):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No enseñas este curso")


def _validate_session(db: Session, session_id: int, enrollment: Enrollment) -> None:
    """A per-session grade must attach to a session of the enrollment's course."""
    session = db.get(ClassSession, session_id)
    if session is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    session_course_id = db.scalar(
        select(Schedule.course_id).where(Schedule.id == session.schedule_id)
    )
    if session_course_id != enrollment.course_id:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "La sesión no pertenece al curso de esta matrícula",
        )
    # A "nota del día" for a day there was no class is a mark with nothing
    # behind it, and it still lands in the final-grade average.
    if session.status == SessionStatus.cancelled:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "La clase fue cancelada; no se puede calificar sobre ella",
        )


def _ensure_enrollment_is_live(enrollment: Enrollment) -> None:
    """Refuse grades against a matrícula that has already been closed out.

    A certificate is issued against the final grade, so regrading a certified
    enrollment silently disagrees with the certificate already in the student's
    hands; a withdrawn one has no course left to be graded on.
    """
    if enrollment.status not in ENROLLMENT_OCCUPIES_SEAT:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            (
                f"La matrícula está en «{ENROLLMENT_STATUS_LABELS[enrollment.status]}»; "
                "no se puede calificar sobre ella"
            ),
        )


@router.get("", response_model=list[GradeRead])
def list_grades(
    enrollment_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[Grade]:
    # A grade reaches its academy through enrollment → course. Without this join
    # the statement was a bare `select(Grade)` for an admin: every score of every
    # student of every academy in the installation.
    stmt = apply_tenant(
        select(Grade)
        .join(Enrollment, Grade.enrollment_id == Enrollment.id)
        .join(Course, Enrollment.course_id == Course.id),
        Course.tenant_id,
        current_user,
    )
    if enrollment_id is not None:
        stmt = stmt.where(Grade.enrollment_id == enrollment_id)
    # Students only see their own grades.
    if current_user.role == UserRole.student:
        # 403 rather than an empty list: the same financial-solvency policy the
        # final grade and the report enforce, and with the same answer. An empty
        # list reads as "you have no grades yet", which sends the student to ask
        # their teacher about a problem only the finance desk can fix.
        if not student_is_solvent(db, current_user.id):
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                "Acceso restringido: Tienes pagos pendientes. Por favor regulariza tu saldo para consultar notas y certificados.",
            )
        # `Enrollment` is already joined for the tenant scope above.
        stmt = stmt.where(Enrollment.student_id == current_user.id)
    # Teachers only see grades for their own courses.
    elif current_user.role == UserRole.teacher:
        course_ids = teacher_course_ids(db, current_user.id)
        stmt = stmt.where(Enrollment.course_id.in_(course_ids or [-1]))
    return list(db.scalars(stmt).all())


@router.post("", response_model=GradeRead, status_code=status.HTTP_201_CREATED)
def create_grade(
    payload: GradeCreate,
    response: Response,
    db: Session = Depends(get_db),
    current_user: User = Depends(staff_only),
) -> Grade:
    """Record a score for one evaluation of one enrollment.

    A grade is either per-session (a daily/participation grade, `session_id`
    set) or course-level (an exam/final, `session_id` null). Either way it is
    idempotent: re-posting the same evaluation re-scores it instead of leaving
    two rows behind — which the gradebook would render as one score while the
    student's average quietly counted both. Single-statement upsert, so
    concurrent saves resolve to one row.
    """
    enrollment = enrollment_in_scope_or_404(db, current_user, payload.enrollment_id)
    _ensure_teacher_owns_enrollment(db, current_user, enrollment)
    _ensure_enrollment_is_live(enrollment)
    if payload.session_id is not None:
        _validate_session(db, payload.session_id, enrollment)

    # The two grade "namespaces" have separate partial-unique indexes, so the
    # upsert must target the matching one.
    dupe_filter = [
        Grade.enrollment_id == payload.enrollment_id,
        Grade.evaluation_name == payload.evaluation_name,
    ]
    if payload.session_id is not None:
        dupe_filter.append(Grade.session_id == payload.session_id)
        index_elements = ["enrollment_id", "session_id", "evaluation_name"]
        index_where = text("session_id IS NOT NULL")
    else:
        dupe_filter.append(Grade.session_id.is_(None))
        index_elements = ["enrollment_id", "evaluation_name"]
        index_where = text("session_id IS NULL")

    existing = db.scalar(select(Grade).where(*dupe_filter))
    before = snapshot(existing) if existing else None

    stmt = (
        pg_insert(Grade)
        .values(**payload.model_dump())
        .on_conflict_do_update(
            index_elements=index_elements,
            index_where=index_where,
            set_={"score": payload.score},
        )
        .returning(Grade)
    )
    grade = db.scalars(stmt, execution_options={"populate_existing": True}).one()
    record(
        db,
        current_user,
        "update" if before else "create",
        "grade",
        grade.id,
        before=before,
        after=snapshot(grade),
    )
    db.commit()
    response.status_code = status.HTTP_200_OK if before else status.HTTP_201_CREATED
    return grade


@router.patch("/{grade_id}", response_model=GradeRead)
def update_grade(
    grade_id: int,
    payload: GradeUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(staff_only),
) -> Grade:
    grade = db.get(Grade, grade_id)
    if grade is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Grade not found")
    enrollment_in_scope_or_404(db, current_user, grade.enrollment_id)
    _ensure_teacher_owns_enrollment(db, current_user, grade.enrollment)
    before = snapshot(grade)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(grade, field, value)
    record(db, current_user, "update", "grade", grade.id, before, snapshot(grade))
    # Renaming an evaluation onto one the student already has would collide with
    # the one-score-per-evaluation rule.
    commit_or_conflict(
        db,
        {
            "message": "El alumno ya tiene una nota para esa evaluación",
            "reason": "duplicate_grade",
        },
    )
    db.refresh(grade)
    return grade


@router.delete("/{grade_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_grade(
    grade_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(staff_only),
) -> None:
    grade = db.get(Grade, grade_id)
    if grade is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Grade not found")
    enrollment_in_scope_or_404(db, current_user, grade.enrollment_id)
    _ensure_teacher_owns_enrollment(db, current_user, grade.enrollment)
    record(db, current_user, "delete", "grade", grade.id, before=snapshot(grade))
    db.delete(grade)
    db.commit()
