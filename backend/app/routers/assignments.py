from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import (
    course_in_scope_or_404,
    get_current_user,
    require_staff_permission,
    student_course_ids,
    teacher_course_ids,
    teacher_teaches_course,
)
from app.models import (
    Assignment,
    AssignmentSubmission,
    Course,
    ENROLLMENT_OCCUPIES_SEAT,
    Enrollment,
    Permission,
    User,
    UserRole,
)
from app.schemas.assignment import (
    AssignmentCreate,
    AssignmentRead,
    RosterStudentStatus,
    SubmissionCreate,
    SubmissionGrade,
    SubmissionRead,
)

router = APIRouter(prefix="/assignments", tags=["assignments"])

staff_only = require_staff_permission(Permission.manage_grades)


def _staff_course_or_404(db: Session, user: User, course_id: int) -> Course:
    """A course this staff member may act on, or 404/403.

    Two questions, and every write endpoint here used to ask neither: is the
    course in the caller's academy, and — for a teacher — do they actually teach
    it? Without the first, any teacher could post work into another academy;
    without the second, into a colleague's course.
    """
    course = course_in_scope_or_404(db, user, course_id)
    if user.role == UserRole.teacher and not teacher_teaches_course(
        db, user.id, course_id
    ):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No enseñas este curso")
    return course


def _visible_assignment_or_404(
    db: Session, user: User, assignment_id: int
) -> Assignment:
    """An assignment whose course the caller may act on, or 404."""
    assignment = db.get(Assignment, assignment_id)
    if assignment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Tarea no encontrada")
    _staff_course_or_404(db, user, assignment.course_id)
    return assignment


@router.get("", response_model=list[AssignmentRead])
def list_assignments(
    course_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[Assignment]:
    stmt = select(Assignment)

    if current_user.tenant_id:
        stmt = stmt.where(Assignment.tenant_id == current_user.tenant_id)

    if current_user.role == UserRole.student:
        enrolled = student_course_ids(db, current_user.id)
        stmt = stmt.where(Assignment.course_id.in_(enrolled or [-1]))
    elif current_user.role == UserRole.teacher:
        taught = teacher_course_ids(db, current_user.id)
        stmt = stmt.where(Assignment.course_id.in_(taught or [-1]))

    if course_id is not None:
        stmt = stmt.where(Assignment.course_id == course_id)

    return list(db.scalars(stmt.order_by(Assignment.created_at.desc())).all())


@router.post("", response_model=AssignmentRead, status_code=status.HTTP_201_CREATED)
def create_assignment(
    payload: AssignmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(staff_only),
) -> Assignment:
    course = _staff_course_or_404(db, current_user, payload.course_id)

    # The course decides the academy, not the caller: a superadmin is tenant-less
    # and would otherwise stamp the assignment with no tenant at all, hiding it
    # from the very academy whose course it belongs to.
    tenant_id = course.tenant_id
    assignment = Assignment(
        **payload.model_dump(),
        tenant_id=tenant_id,
    )
    db.add(assignment)
    db.commit()
    db.refresh(assignment)
    return assignment


@router.get("/{assignment_id}/submissions", response_model=list[SubmissionRead])
def list_submissions(
    assignment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[AssignmentSubmission]:
    if current_user.role == UserRole.student:
        # A student reaches an assignment only through their own enrolment, and
        # only ever sees their own submission of it.
        assignment = db.get(Assignment, assignment_id)
        if assignment is None or assignment.course_id not in student_course_ids(
            db, current_user.id
        ):
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Tarea no encontrada")
        return list(
            db.scalars(
                select(AssignmentSubmission).where(
                    AssignmentSubmission.assignment_id == assignment_id,
                    AssignmentSubmission.student_id == current_user.id,
                )
            ).all()
        )

    _visible_assignment_or_404(db, current_user, assignment_id)
    return list(
        db.scalars(
            select(AssignmentSubmission).where(
                AssignmentSubmission.assignment_id == assignment_id
            )
        ).all()
    )


@router.post(
    "/{assignment_id}/submissions",
    response_model=SubmissionRead,
    status_code=status.HTTP_201_CREATED,
)
def submit_assignment(
    assignment_id: int,
    payload: SubmissionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AssignmentSubmission:
    if current_user.role != UserRole.student:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, detail="Solo los alumnos pueden entregar tareas"
        )

    assignment = db.get(Assignment, assignment_id)
    if assignment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Tarea no encontrada")

    enrolled = student_course_ids(db, current_user.id)
    if assignment.course_id not in enrolled:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, detail="No estás matriculado en este curso"
        )

    submission = db.scalar(
        select(AssignmentSubmission).where(
            AssignmentSubmission.assignment_id == assignment_id,
            AssignmentSubmission.student_id == current_user.id,
        )
    )

    if submission is None:
        submission = AssignmentSubmission(
            assignment_id=assignment_id,
            student_id=current_user.id,
            tenant_id=current_user.tenant_id,
            content=payload.content,
            submission_url=payload.submission_url,
            status="submitted",
        )
        db.add(submission)
    else:
        submission.content = payload.content
        submission.submission_url = payload.submission_url
        submission.status = "submitted"

    db.commit()
    db.refresh(submission)
    return submission


@router.patch("/submissions/{submission_id}", response_model=SubmissionRead)
def grade_submission(
    submission_id: int,
    payload: SubmissionGrade,
    db: Session = Depends(get_db),
    current_user: User = Depends(staff_only),
) -> AssignmentSubmission:
    submission = db.get(AssignmentSubmission, submission_id)
    if submission is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Entrega no encontrada")
    # Grading is a write on someone's academic record; it needs the same course
    # check as everything else here, which it had none of.
    _visible_assignment_or_404(db, current_user, submission.assignment_id)
    submission.score = payload.score
    submission.feedback = payload.feedback
    submission.status = "graded"

    db.commit()
    db.refresh(submission)
    return submission


@router.get("/{assignment_id}/roster-status", response_model=list[RosterStudentStatus])
def get_assignment_roster_status(
    assignment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(staff_only),
) -> list[RosterStudentStatus]:
    assignment = _visible_assignment_or_404(db, current_user, assignment_id)

    # Get enrolled students
    enrollments = list(
        db.scalars(
            select(Enrollment).where(
                Enrollment.course_id == assignment.course_id,
                Enrollment.status.in_(ENROLLMENT_OCCUPIES_SEAT),
            )
        ).all()
    )

    # Get submissions for this assignment
    submissions = list(
        db.scalars(
            select(AssignmentSubmission).where(
                AssignmentSubmission.assignment_id == assignment_id
            )
        ).all()
    )
    subs_by_student = {s.student_id: s for s in submissions}

    roster: list[RosterStudentStatus] = []
    for e in enrollments:
        student = db.get(User, e.student_id)
        if not student:
            continue

        sub = subs_by_student.get(student.id)
        if not sub:
            roster.append(
                RosterStudentStatus(
                    student_id=student.id,
                    full_name=student.full_name,
                    status="not_submitted",
                )
            )
        else:
            is_late = bool(
                assignment.due_date and sub.submitted_at > assignment.due_date
            )
            sub_status = (
                "graded"
                if sub.status == "graded"
                else ("submitted_late" if is_late else "submitted")
            )
            roster.append(
                RosterStudentStatus(
                    student_id=student.id,
                    full_name=student.full_name,
                    status=sub_status,
                    submission_id=sub.id,
                    submitted_at=sub.submitted_at,
                    content=sub.content,
                    submission_url=sub.submission_url,
                    score=sub.score,
                    feedback=sub.feedback,
                    is_late=is_late,
                )
            )
    return roster
