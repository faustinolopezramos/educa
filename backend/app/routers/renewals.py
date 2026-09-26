"""Renovación al siguiente nivel: el alumno pide plaza, dirección decide.

Una academia de idiomas vive de que quien termina A1 siga en A2. Antes esa
continuidad dependía de que alguien en recepción se acordara de ofrecerla; el
botón de "promover" del expediente ni siquiera estaba enlazado a ninguna
pantalla. Ahora quien se gradúa ve los grupos abiertos del nivel siguiente y
pide plaza en uno.

Pedir no es matricularse. La solicitud no ocupa cupo ni genera deuda: la
matrícula se abre cuando dirección aprueba, y se abre por `open_enrollment`, la
misma puerta que la matrícula manual, así que el cupo, el choque de horario y el
estado del curso se vuelven a comprobar en ese momento — pudieron cambiar entre
la solicitud y la aprobación.

La cuota es la de la matrícula que el alumno termina, fijada al pedir para que
quien aprueba vea qué está aceptando. Dirección puede ajustarla después en
Matrículas, como cualquier otra.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.clock import academy_today
from app.core.database import get_db
from app.core.deps import (
    apply_tenant,
    has_user_permission,
    in_tenant,
    require_permission,
    require_role,
)
from app.core.http import commit_or_conflict
from app.models import (
    COURSE_ACCEPTS_ENROLMENT,
    ENROLLMENT_OWES,
    Course,
    Enrollment,
    EnrollmentStatus,
    Level,
    PaymentStatus,
    Permission,
    ProposalStatus,
    RenewalRequest,
    Schedule,
    User,
    UserRole,
)
from app.routers.enrollments import open_enrollment
from app.schemas.enrollment import EnrollmentCreate
from app.schemas.renewal import (
    RenewalCourseOption,
    RenewalOption,
    RenewalOptions,
    RenewalRequestCreate,
    RenewalRequestRead,
    RenewalReview,
    RenewalSlot,
)
from app.services.audit import record, snapshot
from app.services.enrollments import level_after, seats_taken
from app.services.notifications import notify
from app.services.scheduling import student_schedule_conflicts

router = APIRouter(prefix="/renewals", tags=["renewals"])

student_only = require_role(UserRole.student)
admin_only = require_permission(Permission.manage_enrollments)


def _is_delinquent(db: Session, student_id: int) -> bool:
    """Same rule as the rest of the student's screens: money past due."""
    return (
        db.scalar(
            select(Enrollment.id).where(
                Enrollment.student_id == student_id,
                Enrollment.status.in_(ENROLLMENT_OWES),
                Enrollment.payment_status == PaymentStatus.overdue,
            ).limit(1)
        )
        is not None
    )


def _holds_level(db: Session, student_id: int, level_id: int) -> bool:
    """Whether the student already has a live or finished matrícula at `level_id`."""
    return (
        db.scalar(
            select(Enrollment.id)
            .join(Course, Course.id == Enrollment.course_id)
            .where(
                Enrollment.student_id == student_id,
                Course.level_id == level_id,
                Enrollment.status != EnrollmentStatus.withdrawn,
            )
            .limit(1)
        )
        is not None
    )


def _read(db: Session, req: RenewalRequest) -> RenewalRequestRead:
    out = RenewalRequestRead.model_validate(req)
    student = db.get(User, req.student_id)
    course = db.get(Course, req.course_id)
    from_enrollment = db.get(Enrollment, req.from_enrollment_id)
    from_course = db.get(Course, from_enrollment.course_id) if from_enrollment else None
    level = db.get(Level, course.level_id) if course else None
    out.student_name = student.full_name if student else ""
    out.course_name = course.name if course else ""
    out.from_course_name = from_course.name if from_course else ""
    out.level_name = level.name if level else ""
    return out


def _course_option(db: Session, student: User, course: Course) -> RenewalCourseOption:
    schedules = db.scalars(
        select(Schedule)
        .where(Schedule.course_id == course.id)
        .order_by(Schedule.day_of_week, Schedule.start_time)
    ).all()
    return RenewalCourseOption(
        id=course.id,
        name=course.name,
        start_date=course.start_date,
        end_date=course.end_date,
        seats_left=max(0, course.max_students - seats_taken(db, course.id)),
        schedules=[
            RenewalSlot(
                day_of_week=s.day_of_week,
                start_time=s.start_time,
                end_time=s.end_time,
                modality=s.modality,
            )
            for s in schedules
        ],
        clashes=bool(student_schedule_conflicts(db, student_id=student.id, course_id=course.id)),
    )


def _open_courses(db: Session, student: User, level_id: int) -> list[Course]:
    courses = db.scalars(
        select(Course)
        .where(Course.level_id == level_id, Course.status.in_(COURSE_ACCEPTS_ENROLMENT))
        .order_by(Course.start_date, Course.id)
    ).all()
    return [c for c in courses if in_tenant(student, c)]


@router.get("/options", response_model=RenewalOptions)
def renewal_options(
    db: Session = Depends(get_db),
    current_user: User = Depends(student_only),
) -> RenewalOptions:
    """What the student can renew into: one entry per graduated course whose
    next level they have not started yet."""
    graduated = db.scalars(
        select(Enrollment)
        .where(
            Enrollment.student_id == current_user.id,
            Enrollment.status == EnrollmentStatus.graduated,
        )
        .order_by(Enrollment.id.desc())
    ).all()

    options: list[RenewalOption] = []
    seen_levels: set[int] = set()
    for enrollment in graduated:
        course = db.get(Course, enrollment.course_id)
        level = db.get(Level, course.level_id) if course else None
        nxt = level_after(db, level) if level else None
        # Newest first, so a level reached from two graduations (a repeated A1)
        # is offered once, from the most recent.
        if nxt is None or nxt.id in seen_levels or _holds_level(db, current_user.id, nxt.id):
            continue
        seen_levels.add(nxt.id)
        latest = db.scalar(
            select(RenewalRequest)
            .where(
                RenewalRequest.from_enrollment_id == enrollment.id,
                RenewalRequest.status != ProposalStatus.approved,
            )
            .order_by(RenewalRequest.id.desc())
            .limit(1)
        )
        options.append(
            RenewalOption(
                from_enrollment_id=enrollment.id,
                from_course_name=course.name,
                current_level_name=level.name,
                next_level_name=nxt.name,
                amount=enrollment.amount,
                courses=[_course_option(db, current_user, c) for c in _open_courses(db, current_user, nxt.id)],
                request=_read(db, latest) if latest else None,
            )
        )

    return RenewalOptions(
        blocked_reason="delinquent" if options and _is_delinquent(db, current_user.id) else None,
        options=options,
    )


@router.post("", response_model=RenewalRequestRead, status_code=status.HTTP_201_CREATED)
def request_renewal(
    payload: RenewalRequestCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(student_only),
) -> RenewalRequestRead:
    enrollment = db.get(Enrollment, payload.from_enrollment_id)
    if enrollment is None or enrollment.student_id != current_user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Enrollment not found")
    if enrollment.status != EnrollmentStatus.graduated:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            {"message": "Sólo se renueva un curso terminado y aprobado", "reason": "not_graduated"},
        )
    if _is_delinquent(db, current_user.id):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            {"message": "Ponte al día con tus pagos para pedir plaza", "reason": "delinquent"},
        )

    course = db.get(Course, payload.course_id)
    if not in_tenant(current_user, course):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Course not found")
    current_level = db.get(Level, db.get(Course, enrollment.course_id).level_id)
    nxt = level_after(db, current_level)
    if nxt is None or course.level_id != nxt.id:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            {"message": "Ese grupo no es del nivel siguiente", "reason": "wrong_level"},
        )
    if _holds_level(db, current_user.id, nxt.id):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            {"message": "Ya tienes matrícula en ese nivel", "reason": "already_enrolled"},
        )

    option = _course_option(db, current_user, course)
    if course.status not in COURSE_ACCEPTS_ENROLMENT:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            {"message": "Ese grupo ya no admite matrículas", "reason": "course_not_open"},
        )
    if option.seats_left == 0:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            {"message": "Ese grupo ya no tiene cupo", "reason": "capacity"},
        )
    if option.clashes:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            {"message": "Ese horario choca con otra clase tuya", "reason": "student_schedule"},
        )

    already_pending = {
        "message": "Ya tienes una solicitud en curso para este nivel",
        "reason": "already_pending",
    }
    if db.scalar(
        select(RenewalRequest.id).where(
            RenewalRequest.from_enrollment_id == enrollment.id,
            RenewalRequest.status == ProposalStatus.pending,
        )
    ):
        raise HTTPException(status.HTTP_409_CONFLICT, already_pending)

    req = RenewalRequest(
        student_id=current_user.id,
        from_enrollment_id=enrollment.id,
        course_id=course.id,
        amount=enrollment.amount,
    )
    db.add(req)
    db.flush()
    record(db, current_user, "create", "renewal_request", req.id, after=snapshot(req))

    directors = [
        u.id
        for u in db.scalars(
            select(User).where(
                User.role.in_([UserRole.admin, UserRole.assistant]),
                User.is_active.is_(True),
                User.tenant_id == current_user.tenant_id
                if current_user.tenant_id is not None
                else User.tenant_id.is_(None),
            )
        ).all()
        if has_user_permission(u, Permission.manage_enrollments)
    ]
    notify(
        db,
        directors,
        "renewal_requested",
        "Solicitud de renovación",
        f"{current_user.full_name} pide plaza en {course.name} ({nxt.name}).",
        data={"renewal_request_id": req.id},
    )
    # Two taps racing past the check above still meet the unique index.
    commit_or_conflict(db, already_pending)
    db.refresh(req)
    return _read(db, req)


@router.delete("/{request_id}", status_code=status.HTTP_204_NO_CONTENT)
def withdraw_request(
    request_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(student_only),
) -> None:
    """The student changes their mind (or wants a different group)."""
    req = db.get(RenewalRequest, request_id)
    if req is None or req.student_id != current_user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Request not found")
    if req.status is not ProposalStatus.pending:
        raise HTTPException(status.HTTP_409_CONFLICT, "La solicitud ya fue revisada")
    record(db, current_user, "delete", "renewal_request", req.id, before=snapshot(req))
    db.delete(req)
    db.commit()


@router.get("", response_model=list[RenewalRequestRead])
def list_requests(
    status_filter: ProposalStatus | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(admin_only),
) -> list[RenewalRequestRead]:
    stmt = apply_tenant(
        select(RenewalRequest).join(Course, Course.id == RenewalRequest.course_id),
        Course.tenant_id,
        current_user,
    )
    if status_filter is not None:
        stmt = stmt.where(RenewalRequest.status == status_filter)
    rows = db.scalars(stmt.order_by(RenewalRequest.id)).all()
    return [_read(db, r) for r in rows]


def _pending_in_scope(db: Session, actor: User, request_id: int) -> RenewalRequest:
    req = db.get(RenewalRequest, request_id)
    if req is None or not in_tenant(actor, db.get(Course, req.course_id)):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Request not found")
    if req.status is not ProposalStatus.pending:
        raise HTTPException(status.HTTP_409_CONFLICT, "La solicitud ya fue revisada")
    return req


@router.post("/{request_id}/approve", response_model=RenewalRequestRead)
def approve_request(
    request_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(admin_only),
) -> RenewalRequestRead:
    req = _pending_in_scope(db, current_user, request_id)
    course = db.get(Course, req.course_id)
    today = academy_today()
    # La cuota vence cuando empieza el grupo; si ya empezó, hoy. Sin fecha la
    # deuda no vencería nunca y la renovación quedaría fuera del cobro.
    due = max(course.start_date, today) if course.start_date else today
    enrollment = open_enrollment(
        db,
        current_user,
        EnrollmentCreate(
            student_id=req.student_id,
            course_id=req.course_id,
            status=EnrollmentStatus.enrolled,
            amount=req.amount,
            due_date=due,
        ),
    )
    before = snapshot(req)
    req.status = ProposalStatus.approved
    req.reviewed_by = current_user.id
    req.reviewed_at = datetime.now(timezone.utc)
    req.enrollment_id = enrollment.id
    record(db, current_user, "update", "renewal_request", req.id, before, snapshot(req))
    notify(
        db,
        [req.student_id],
        "renewal_approved",
        "¡Tienes plaza en tu siguiente nivel!",
        f"Tu matrícula en {course.name} está confirmada. Código: {enrollment.enrollment_code}.",
        data={"renewal_request_id": req.id, "enrollment_id": enrollment.id},
    )
    commit_or_conflict(
        db, {"message": "El alumno ya tiene matrícula en ese curso", "reason": "already_enrolled"}
    )
    db.refresh(req)
    return _read(db, req)


@router.post("/{request_id}/reject", response_model=RenewalRequestRead)
def reject_request(
    request_id: int,
    payload: RenewalReview,
    db: Session = Depends(get_db),
    current_user: User = Depends(admin_only),
) -> RenewalRequestRead:
    req = _pending_in_scope(db, current_user, request_id)
    course = db.get(Course, req.course_id)
    before = snapshot(req)
    req.status = ProposalStatus.rejected
    req.reviewed_by = current_user.id
    req.reviewed_at = datetime.now(timezone.utc)
    req.review_note = (payload.note or "").strip() or None
    record(db, current_user, "update", "renewal_request", req.id, before, snapshot(req))
    body = f"Tu solicitud para {course.name} no pudo aceptarse."
    if req.review_note:
        body += f" Motivo: {req.review_note}"
    body += " Puedes elegir otro grupo desde tu inicio."
    notify(
        db,
        [req.student_id],
        "renewal_rejected",
        "Solicitud de renovación no aceptada",
        body,
        data={"renewal_request_id": req.id},
    )
    db.commit()
    db.refresh(req)
    return _read(db, req)
