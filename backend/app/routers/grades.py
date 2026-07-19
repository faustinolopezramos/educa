from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import (
    get_current_user,
    require_role,
    student_is_solvent,
    teacher_course_ids,
    teacher_teaches_course,
)
from app.core.http import commit_or_conflict
from app.models import ClassSession, Enrollment, Grade, Schedule, User, UserRole
from app.schemas.grade import GradeCreate, GradeRead, GradeUpdate
from app.services.audit import record, snapshot

router = APIRouter(prefix="/grades", tags=["grades"])

staff_only = require_role(UserRole.admin, UserRole.teacher)


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


@router.get("", response_model=list[GradeRead])
def list_grades(
    enrollment_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[Grade]:
    stmt = select(Grade)
    if enrollment_id is not None:
        stmt = stmt.where(Grade.enrollment_id == enrollment_id)
    # Students only see their own grades.
    if current_user.role == UserRole.student:
        if not student_is_solvent(db, current_user.id):
            return []
        stmt = stmt.join(Enrollment).where(Enrollment.student_id == current_user.id)
    # Teachers only see grades for their own courses.
    elif current_user.role == UserRole.teacher:
        course_ids = teacher_course_ids(db, current_user.id)
        stmt = stmt.join(Enrollment).where(Enrollment.course_id.in_(course_ids or [-1]))
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
    enrollment = db.get(Enrollment, payload.enrollment_id)
    if enrollment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Enrollment not found")
    _ensure_teacher_owns_enrollment(db, current_user, enrollment)
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
        index_where = Grade.session_id.isnot(None)
    else:
        dupe_filter.append(Grade.session_id.is_(None))
        index_elements = ["enrollment_id", "evaluation_name"]
        index_where = Grade.session_id.is_(None)

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
    response.status_code = (
        status.HTTP_200_OK if before else status.HTTP_201_CREATED
    )
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
    _ensure_teacher_owns_enrollment(db, current_user, grade.enrollment)
    record(db, current_user, "delete", "grade", grade.id, before=snapshot(grade))
    db.delete(grade)
    db.commit()
