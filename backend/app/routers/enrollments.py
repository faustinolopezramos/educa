from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import (
    apply_tenant,
    get_current_user,
    in_tenant,
    require_permission,
    require_role,
    teacher_course_ids,
)
from app.models import (
    COURSE_ACCEPTS_ENROLMENT,
    COURSE_STATUS_LABELS,
    ENROLLMENT_OCCUPIES_SEAT,
    ENROLLMENT_OPENING_STATES,
    ENROLLMENT_STATUS_LABELS,
    Attendance,
    Certificate,
    Course,
    Enrollment,
    Grade,
    enrollment_transition_allowed,
    EnrollmentStatus,
    Level,
    Payment,
    PaymentKind,
    Permission,
    User,
    UserRole,
)
from app.schemas.enrollment import (
    BulkEnrollOutcome,
    BulkEnrollRequest,
    BulkEnrollResult,
    EnrollmentCreate,
    EnrollmentRead,
    EnrollmentUpdate,
)
from app.services.audit import record, snapshot
from app.services.enrollments import (
    attach_balances,
    check_tenant_student_quota,
    seats_taken,
)
from app.services.finance import refresh_payment_status
from app.services.scheduling import student_schedule_conflicts
from app.services.sequences import next_enrollment_code

router = APIRouter(prefix="/enrollments", tags=["enrollments"])

admin_only = require_permission(Permission.manage_enrollments)


def _in_scope_or_404(db: Session, actor: User, enrollment_id: int) -> Enrollment:
    """An enrollment of the caller's academy, or 404 (reached via its course)."""
    enrollment = db.get(Enrollment, enrollment_id)
    if enrollment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Enrollment not found")
    if not in_tenant(actor, db.get(Course, enrollment.course_id)):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Enrollment not found")
    return enrollment


@router.get("", response_model=list[EnrollmentRead])
def list_enrollments(
    course_id: int | None = None,
    student_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[Enrollment]:
    # An enrollment has no tenant of its own; it belongs to whichever academy
    # owns the course, so the scope comes from that join.
    stmt = apply_tenant(
        select(Enrollment).join(Course, Enrollment.course_id == Course.id),
        Course.tenant_id,
        current_user,
    )
    # Students may only see their own enrollments.
    if current_user.role == UserRole.student:
        stmt = stmt.where(Enrollment.student_id == current_user.id)
    else:
        # Teachers only see enrollments of the courses they teach.
        if current_user.role == UserRole.teacher:
            taught = teacher_course_ids(db, current_user.id)
            stmt = stmt.where(Enrollment.course_id.in_(taught or [-1]))
        if student_id is not None:
            stmt = stmt.where(Enrollment.student_id == student_id)
    if course_id is not None:
        stmt = stmt.where(Enrollment.course_id == course_id)
    return attach_balances(db, db.scalars(stmt).all())


@router.post("", response_model=EnrollmentRead, status_code=status.HTTP_201_CREATED)
def create_enrollment(
    payload: EnrollmentCreate,
    force: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(admin_only),
) -> Enrollment:
    student = db.get(User, payload.student_id)
    if not in_tenant(current_user, student) or student.role != UserRole.student:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "student_id must be a student")

    if current_user.tenant_id is not None:
        check_tenant_student_quota(db, current_user.tenant_id)


    # A matrícula is born either "Inscrito" or "Activo". Accepting any status the
    # caller sent let one be created already certified or withdrawn — states that
    # describe how a course *ended*, applied to one that never began.
    if payload.status not in ENROLLMENT_OPENING_STATES:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Una matrícula sólo puede crearse como Inscrito o Activo",
        )

    # Lock the course row so concurrent enrollments cannot exceed max_students.
    course = db.scalar(
        select(Course).where(Course.id == payload.course_id).with_for_update()
    )
    if not in_tenant(current_user, course):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Course not found")

    # A draft has no timetable and no teacher yet; a closed or archived course
    # is over. Seating a student in either produces a matrícula for something
    # that cannot be delivered.
    if course.status not in COURSE_ACCEPTS_ENROLMENT:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": (
                    f"El curso está en «{COURSE_STATUS_LABELS[course.status]}» y no "
                    "admite matrículas."
                ),
                "reason": "course_not_open",
                "course_status": course.status.value,
            },
        )

    if db.scalar(
        select(Enrollment).where(
            Enrollment.student_id == payload.student_id,
            Enrollment.course_id == payload.course_id,
            Enrollment.status != EnrollmentStatus.withdrawn,
        )
    ):
        raise HTTPException(status.HTTP_409_CONFLICT, "Student already enrolled")

    # Capacity: every enrollment holding a seat, not just the activated ones.
    taken = seats_taken(db, payload.course_id)
    if taken >= course.max_students:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": f"Cupo lleno ({taken}/{course.max_students})",
                "reason": "capacity",
            },
        )

    # Student timetable clash (unless an admin forces it).
    if not force:
        clashes = student_schedule_conflicts(
            db, student_id=payload.student_id, course_id=payload.course_id
        )
        if clashes:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "message": "El horario del alumno choca con otra clase suya",
                    "reason": "student_schedule",
                    "conflicts": [
                        {
                            "schedule_id": s.id,
                            "course_id": s.course_id,
                            "day_of_week": s.day_of_week,
                            "start_time": s.start_time.isoformat(),
                            "end_time": s.end_time.isoformat(),
                        }
                        for s in clashes
                    ],
                },
            )

    data = payload.model_dump()
    due_date = data.pop("due_date", None)
    enrollment = Enrollment(
        **data,
        enrollment_code=next_enrollment_code(db, year=datetime.now(timezone.utc).year),
    )
    db.add(enrollment)
    db.flush()
    # Seed the ledger with the agreed cuota so the balance starts consistent;
    # a zero-amount enrollment (amount left at the 0.0 default) adds no charge.
    if enrollment.amount:
        db.add(
            Payment(
                enrollment_id=enrollment.id,
                kind=PaymentKind.charge,
                amount=enrollment.amount,
                due_date=due_date,
                notes="Cuota inicial de matrícula",
            )
        )
        db.flush()
    # Derive the status from the ledger we just opened rather than trusting the
    # one the caller sent: a cuota already past its due date is delinquent from
    # the moment it exists.
    refresh_payment_status(db, enrollment)
    # A matrícula appearing is the academic *and* financial entry point of the
    # whole system — it seats a student, opens a ledger and mints a code. Editing
    # and deleting one were both traced; creating one was the gap.
    record(
        db,
        current_user,
        "create",
        "enrollment",
        enrollment.id,
        after=snapshot(enrollment),
    )
    db.commit()
    db.refresh(enrollment)
    return attach_balances(db, [enrollment])[0]


@router.get("/{enrollment_id}/next-level-suggestion")
def suggest_next_level_enrollment(
    enrollment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(admin_only),
) -> dict:
    """Sugiére el siguiente nivel e identifica cursos abiertos para re-matriculación en 1-clic."""
    enrollment = _in_scope_or_404(db, current_user, enrollment_id)
    course = db.get(Course, enrollment.course_id)
    if course is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Course not found")

    current_level = db.get(Level, course.level_id) if course.level_id else None

    next_level = None
    if current_level:
        sibling_levels = list(
            db.scalars(
                select(Level)
                .where(Level.language_id == current_level.language_id)
                .order_by(Level.id)
            ).all()
        )
        for idx, lvl in enumerate(sibling_levels):
            if lvl.id == current_level.id and idx + 1 < len(sibling_levels):
                next_level = sibling_levels[idx + 1]
                break

    suggested_courses = []
    if next_level:
        open_courses = list(
            db.scalars(
                select(Course).where(
                    Course.level_id == next_level.id,
                    Course.status.in_(COURSE_ACCEPTS_ENROLMENT),
                )
            ).all()
        )
        suggested_courses = [
            {
                "id": c.id,
                "title": c.name,
                "max_students": c.max_students,
                "seats_taken": seats_taken(db, c.id),
            }
            for c in open_courses
        ]

    return {
        "student_id": enrollment.student_id,
        # `Course.name`: el modelo no tiene `title`, así que este endpoint
        # respondía 500 en cuanto se le llamaba.
        "current_course_title": course.name,
        "current_level_name": current_level.name if current_level else None,
        "next_level_id": next_level.id if next_level else None,
        "next_level_name": next_level.name if next_level else None,
        "suggested_courses": suggested_courses,
    }


@router.patch("/{enrollment_id}", response_model=EnrollmentRead)
def update_enrollment(
    enrollment_id: int,
    payload: EnrollmentUpdate,
    force: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(admin_only),
) -> Enrollment:
    enrollment = _in_scope_or_404(db, current_user, enrollment_id)

    # The lifecycle is a path, not a set of interchangeable labels. Without this
    # a PATCH could walk a matrícula straight from "Desistió" back to "Activo",
    # or un-certify a student whose certificate had already been issued against
    # that very state.
    if payload.status is not None and not enrollment_transition_allowed(
        enrollment.status, payload.status
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": (
                    f"No se puede pasar de "
                    f"«{ENROLLMENT_STATUS_LABELS[enrollment.status]}» a "
                    f"«{ENROLLMENT_STATUS_LABELS[payload.status]}»"
                ),
                "reason": "illegal_transition",
                "from": enrollment.status.value,
                "to": payload.status.value,
            },
        )

    # Taking a seat back re-runs the checks that guarded the original enrollment:
    # capacity, and the student's own timetable. A paused matrícula released its
    # seat, so returning to the room has to find one free.
    if (
        payload.status is not None
        and payload.status in ENROLLMENT_OCCUPIES_SEAT
        and enrollment.status not in ENROLLMENT_OCCUPIES_SEAT
    ):
        if current_user.tenant_id is not None:
            check_tenant_student_quota(db, current_user.tenant_id)
        course = db.scalar(
            select(Course).where(Course.id == enrollment.course_id).with_for_update()
        )
        # A missing course used to skip the capacity check silently, letting a
        # reactivation through with no limit applied at all. It cannot happen
        # through the API, but "cannot happen" is not a reason to fall open.
        if course is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Course not found")
        taken = seats_taken(db, enrollment.course_id, exclude_enrollment_id=enrollment_id)
        if taken >= course.max_students:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "message": f"Cupo lleno ({taken}/{course.max_students})",
                    "reason": "capacity",
                },
            )
        if not force:
            clashes = student_schedule_conflicts(
                db, student_id=enrollment.student_id, course_id=enrollment.course_id
            )
            if clashes:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail={
                        "message": "El horario del alumno choca con otra clase suya",
                        "reason": "student_schedule",
                    },
                )

    before = snapshot(enrollment)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(enrollment, field, value)
    record(
        db,
        current_user,
        "update",
        "enrollment",
        enrollment.id,
        before,
        snapshot(enrollment),
    )
    db.commit()
    db.refresh(enrollment)
    return attach_balances(db, [enrollment])[0]


@router.delete("/{enrollment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_enrollment(
    enrollment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(admin_only),
) -> None:
    enrollment = _in_scope_or_404(db, current_user, enrollment_id)

    # Una matrícula con expediente detrás no se borra: el `cascade` se llevaría
    # por delante las notas, la asistencia y el certificado del alumno en ese
    # curso, y la fila de auditoría sólo guardaría la matrícula — no lo que
    # desapareció con ella. Para eso está «Desistió», que es la baja lógica que
    # el resto del sistema usa por este mismo motivo.
    #
    # El DELETE sigue existiendo para lo que sí es un error de captura: una
    # matrícula recién creada sobre la que todavía nadie escribió nada.
    grades = db.scalar(
        select(func.count(Grade.id)).where(Grade.enrollment_id == enrollment.id)
    )
    marks = db.scalar(
        select(func.count(Attendance.id)).where(
            Attendance.enrollment_id == enrollment.id
        )
    )
    certificate = db.scalar(
        select(Certificate.id).where(Certificate.enrollment_id == enrollment.id)
    )
    if grades or marks or certificate:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": (
                    "Esta matrícula ya tiene expediente académico y no puede "
                    "eliminarse. Cámbiala a «Desistió» para darla de baja sin "
                    "perder sus notas ni su asistencia."
                ),
                "reason": "has_academic_record",
                "grades": grades or 0,
                "attendance": marks or 0,
                "certificate": certificate is not None,
            },
        )

    record(
        db,
        current_user,
        "delete",
        "enrollment",
        enrollment.id,
        before=snapshot(enrollment),
    )
    db.delete(enrollment)
    db.commit()


@router.post("/bulk", response_model=BulkEnrollResult)
def bulk_enroll(
    payload: BulkEnrollRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(admin_only),
) -> BulkEnrollResult:
    """Seat several students in one course, reporting on each.

    Deliberately not all-or-nothing: seating thirty students where two clash is
    twenty-eight successes and two problems to look at. A rollback would make
    the admin find the two by hand and redo the other twenty-eight.

    Every rule the single-student endpoint applies applies here too — course
    state, duplicate matrícula, capacity, timetable clash — checked per student
    and against a capacity that shrinks as the batch fills the room.
    """
    course = db.scalar(
        select(Course).where(Course.id == payload.course_id).with_for_update()
    )
    if not in_tenant(current_user, course):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Course not found")
    if course.status not in COURSE_ACCEPTS_ENROLMENT:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": (
                    f"El curso está en «{COURSE_STATUS_LABELS[course.status]}» y no "
                    "admite matrículas."
                ),
                "reason": "course_not_open",
            },
        )

    taken = seats_taken(db, course.id)
    year = datetime.now(timezone.utc).year
    outcomes: list[BulkEnrollOutcome] = []

    # Deduplicated, but in the order the admin picked them: the result list
    # should read like the selection they made.
    seen: set[int] = set()
    ordered_ids = [
        sid for sid in payload.student_ids if not (sid in seen or seen.add(sid))
    ]

    for student_id in ordered_ids:
        student = db.get(User, student_id)
        name = student.full_name if student else f"#{student_id}"

        if current_user.tenant_id is not None:
            try:
                check_tenant_student_quota(db, current_user.tenant_id)
            except HTTPException:
                outcomes.append(
                    BulkEnrollOutcome(
                        student_id=student_id,
                        student_name=name,
                        ok=False,
                        reason="Se ha alcanzado el límite de estudiantes de la academia",
                    )
                )
                continue


        if not in_tenant(current_user, student) or student.role != UserRole.student:
            outcomes.append(
                BulkEnrollOutcome(
                    student_id=student_id,
                    student_name=name,
                    ok=False,
                    reason="No es un alumno de esta academia",
                )
            )
            continue

        if db.scalar(
            select(Enrollment.id).where(
                Enrollment.student_id == student_id,
                Enrollment.course_id == course.id,
                Enrollment.status != EnrollmentStatus.withdrawn,
            )
        ):
            outcomes.append(
                BulkEnrollOutcome(
                    student_id=student_id,
                    student_name=name,
                    ok=False,
                    reason="Ya está matriculado en este curso",
                )
            )
            continue

        # Counted as the batch goes, so a batch bigger than the room fills it
        # and then starts refusing rather than overshooting.
        if taken >= course.max_students:
            outcomes.append(
                BulkEnrollOutcome(
                    student_id=student_id,
                    student_name=name,
                    ok=False,
                    reason=f"Cupo lleno ({taken}/{course.max_students})",
                )
            )
            continue

        if not payload.force:
            clashes = student_schedule_conflicts(
                db, student_id=student_id, course_id=course.id
            )
            if clashes:
                outcomes.append(
                    BulkEnrollOutcome(
                        student_id=student_id,
                        student_name=name,
                        ok=False,
                        reason="Su horario choca con otra clase suya",
                    )
                )
                continue

        enrollment = Enrollment(
            student_id=student_id,
            course_id=course.id,
            amount=payload.amount,
            enrollment_code=next_enrollment_code(db, year=year),
        )
        db.add(enrollment)
        db.flush()
        if enrollment.amount:
            db.add(
                Payment(
                    enrollment_id=enrollment.id,
                    kind=PaymentKind.charge,
                    amount=enrollment.amount,
                    due_date=payload.due_date,
                    notes="Cuota inicial de matrícula",
                )
            )
            db.flush()
        refresh_payment_status(db, enrollment)
        record(
            db,
            current_user,
            "create",
            "enrollment",
            enrollment.id,
            after=snapshot(enrollment),
        )
        taken += 1
        outcomes.append(
            BulkEnrollOutcome(
                student_id=student_id,
                student_name=name,
                ok=True,
                enrollment_id=enrollment.id,
                enrollment_code=enrollment.enrollment_code,
            )
        )

    db.commit()
    created = sum(1 for o in outcomes if o.ok)
    return BulkEnrollResult(
        created=created, failed=len(outcomes) - created, outcomes=outcomes
    )
