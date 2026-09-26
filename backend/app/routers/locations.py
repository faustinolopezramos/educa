"""Where a class is held: a teacher proposes, an admin approves.

The schedule holds the *effective* (approved) location; a `LocationProposal`
holds a pending change so it never disturbs the running class until reviewed.

Qué necesita cada modalidad lo deciden `MODALITY_USES_ROOM` y
`MODALITY_NEEDS_LINK`, no un `if virtual … else …`: **semi presencial responde
que sí a las dos**, y tratarla como "todo lo que no es virtual" la dejaba sin
enlace y sin comprobación de aula ocupada.

Aprobar una propuesta que reserva aula vuelve a correr la comprobación de doble
reserva, porque el aula pudo ocuparse entre la propuesta y la aprobación.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.http import commit_or_conflict
from app.core.deps import (
    apply_tenant,
    get_current_user,
    in_tenant,
    is_admin,
    require_permission,
    require_staff_permission,
    teacher_teaches_course,
)
from app.models import (
    MODALITY_USES_ROOM,
    Course,
    LocationProposal,
    Permission,
    ProposalStatus,
    Room,
    Schedule,
    User,
    UserRole,
)
from app.schemas.location import (
    LocationProposalCreate,
    LocationProposalRead,
    ProposalReview,
)
from app.services.audit import record, snapshot
from app.services.scheduling import room_conflicts

router = APIRouter(tags=["locations"])

admin_only = require_permission(Permission.manage_schedules)
staff_only = require_staff_permission(Permission.manage_schedules)


def _apply_to_schedule(schedule: Schedule, proposal: LocationProposal) -> None:
    schedule.modality = proposal.modality
    schedule.room_id = proposal.room_id
    schedule.join_url = proposal.join_url
    schedule.provider = proposal.provider


def _commit_or_room_conflict(db: Session) -> None:
    """Commit, convirtiendo un choque de aula del esquema en 409.

    La comprobación en Python y este commit no son atómicos, y además el aula
    puede haber sido ocupada por otro horario entre una cosa y la otra. Quien
    pierde la carrera pidió algo que el modelo prohíbe, que es un conflicto y no
    un error del servidor.
    """
    commit_or_conflict(
        db,
        {
            "message": "El aula ya está ocupada en ese horario",
            "reason": "room_conflict",
        },
    )


def _reject_room_clash(db: Session, schedule: Schedule, room_id: int) -> None:
    clashes = room_conflicts(
        db,
        room_id=room_id,
        day_of_week=schedule.day_of_week,
        start_time=schedule.start_time,
        end_time=schedule.end_time,
        term_start=schedule.term_start,
        term_end=schedule.term_end,
        exclude_schedule_id=schedule.id,
    )
    if clashes:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": "El aula ya está ocupada en ese horario",
                "reason": "room_conflict",
            },
        )


@router.post(
    "/schedules/{schedule_id}/location/propose",
    response_model=LocationProposalRead,
    status_code=status.HTTP_201_CREATED,
)
def propose_location(
    schedule_id: int,
    payload: LocationProposalCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(staff_only),
) -> LocationProposal:
    """A teacher proposes where they will hold this class.

    An admin proposing self-approves: the proposal is applied immediately, since
    the admin is the approver.
    """
    schedule = db.get(Schedule, schedule_id)
    if schedule is not None and not in_tenant(
        current_user, db.get(Course, schedule.course_id)
    ):
        schedule = None
    if schedule is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Schedule not found")
    # A teacher may only propose for a course they teach.
    if current_user.role == UserRole.teacher and not teacher_teaches_course(
        db, current_user.id, schedule.course_id
    ):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No enseñas este curso")
    if payload.room_id is not None and not in_tenant(
        current_user, db.get(Room, payload.room_id)
    ):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Room not found")

    self_approves = is_admin(current_user)
    proposal = LocationProposal(
        schedule_id=schedule_id,
        proposed_by=current_user.id,
        modality=payload.modality,
        room_id=payload.room_id,
        provider=payload.provider,
        join_url=payload.join_url,
        status=ProposalStatus.approved if self_approves else ProposalStatus.pending,
    )
    if self_approves:
        # Cualquier modalidad que ocupe aula compite por ella. Preguntar por
        # `== presencial` dejaba fuera a semi presencial, que también reserva
        # una: el choque lo acababa atrapando la restricción de la base de datos
        # y salía como 500 en vez de "el aula ya está ocupada".
        if payload.modality in MODALITY_USES_ROOM and payload.room_id is not None:
            _reject_room_clash(db, schedule, payload.room_id)
        proposal.reviewed_by = current_user.id
        _apply_to_schedule(schedule, proposal)
    db.add(proposal)
    _commit_or_room_conflict(db)
    db.refresh(proposal)
    return proposal


@router.get("/location-proposals", response_model=list[LocationProposalRead])
def list_proposals(
    status_filter: ProposalStatus | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(staff_only),
) -> list[LocationProposal]:
    """Admins see their academy's proposals; a teacher sees only their own.

    Scoped through the schedule's course: a proposal has no tenant of its own,
    and this list used to return every academy's links and rooms.
    """
    stmt = apply_tenant(
        select(LocationProposal)
        .join(Schedule, Schedule.id == LocationProposal.schedule_id)
        .join(Course, Course.id == Schedule.course_id),
        Course.tenant_id,
        current_user,
    )
    if current_user.role == UserRole.teacher:
        stmt = stmt.where(LocationProposal.proposed_by == current_user.id)
    if status_filter is not None:
        stmt = stmt.where(LocationProposal.status == status_filter)
    return list(db.scalars(stmt.order_by(LocationProposal.id.desc())).all())


def _pending_or_404(db: Session, actor: User, proposal_id: int) -> LocationProposal:
    """A pending proposal of the caller's academy — another academy's is a 404."""
    proposal = db.get(LocationProposal, proposal_id)
    schedule = db.get(Schedule, proposal.schedule_id) if proposal else None
    if schedule is None or not in_tenant(actor, db.get(Course, schedule.course_id)):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Proposal not found")
    if proposal.status is not ProposalStatus.pending:
        raise HTTPException(status.HTTP_409_CONFLICT, "La propuesta ya fue revisada")
    return proposal


@router.post(
    "/location-proposals/{proposal_id}/approve",
    response_model=LocationProposalRead,
)
def approve_proposal(
    proposal_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(admin_only),
) -> LocationProposal:
    proposal = _pending_or_404(db, current_user, proposal_id)
    schedule = db.get(Schedule, proposal.schedule_id)
    if schedule is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Schedule not found")
    # Igual que al auto-aprobar: semi presencial también ocupa aula. Y el aula
    # pudo ocuparse entre que el profesor propuso y dirección aprueba, que es
    # justo el hueco que este endpoint tiene por delante.
    if proposal.modality in MODALITY_USES_ROOM and proposal.room_id is not None:
        _reject_room_clash(db, schedule, proposal.room_id)
    before = snapshot(proposal)
    proposal.status = ProposalStatus.approved
    proposal.reviewed_by = current_user.id
    _apply_to_schedule(schedule, proposal)
    record(
        db,
        current_user,
        "update",
        "location_proposal",
        proposal.id,
        before,
        snapshot(proposal),
    )
    _commit_or_room_conflict(db)
    db.refresh(proposal)
    return proposal


@router.post(
    "/location-proposals/{proposal_id}/reject",
    response_model=LocationProposalRead,
)
def reject_proposal(
    proposal_id: int,
    payload: ProposalReview,
    db: Session = Depends(get_db),
    current_user: User = Depends(admin_only),
) -> LocationProposal:
    proposal = _pending_or_404(db, current_user, proposal_id)
    before = snapshot(proposal)
    proposal.status = ProposalStatus.rejected
    proposal.reviewed_by = current_user.id
    proposal.review_note = payload.note
    record(
        db,
        current_user,
        "update",
        "location_proposal",
        proposal.id,
        before,
        snapshot(proposal),
    )
    db.commit()
    db.refresh(proposal)
    return proposal
