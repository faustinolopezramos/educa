from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import (
    get_current_user,
    require_role,
    student_course_ids,
    teacher_course_ids,
)
from app.models import (
    Assignment,
    AssignmentSubmission,
    Course,
    Enrollment,
    EnrollmentStatus,
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

staff_only = require_role(UserRole.admin, UserRole.teacher)


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
    course = db.get(Course, payload.course_id)
    if course is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Curso no encontrado")

    tenant_id = current_user.tenant_id or getattr(course, "tenant_id", None)
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
    assignment = db.get(Assignment, assignment_id)
    if assignment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Tarea no encontrada")

    stmt = select(AssignmentSubmission).where(
        AssignmentSubmission.assignment_id == assignment_id
    )

    if current_user.role == UserRole.student:
        stmt = stmt.where(AssignmentSubmission.student_id == current_user.id)

    return list(db.scalars(stmt).all())


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
    assignment = db.get(Assignment, assignment_id)
    if assignment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Tarea no encontrada")

    # Get enrolled students
    enrollments = list(
        db.scalars(
            select(Enrollment).where(
                Enrollment.course_id == assignment.course_id,
                Enrollment.status.in_(
                    [EnrollmentStatus.active, EnrollmentStatus.enrolled]
                ),
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
