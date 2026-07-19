"""Where a class is held: a teacher proposes, an admin approves.

The schedule holds the *effective* (approved) location; a `LocationProposal`
holds a pending change so it never disturbs the running class until reviewed.
Approving a presencial proposal re-runs the room double-booking check, so an
approval can never create a clash the exclusion constraint would reject anyway.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user, require_role, teacher_teaches_course
from app.models import (
    LocationProposal,
    Modality,
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

admin_only = require_role(UserRole.admin)
staff_only = require_role(UserRole.admin, UserRole.teacher)


def _apply_to_schedule(schedule: Schedule, proposal: LocationProposal) -> None:
    schedule.modality = proposal.modality
    schedule.room_id = proposal.room_id
    schedule.join_url = proposal.join_url
    schedule.provider = proposal.provider


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
    if schedule is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Schedule not found")
    # A teacher may only propose for a course they teach.
    if current_user.role == UserRole.teacher and not teacher_teaches_course(
        db, current_user.id, schedule.course_id
    ):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No enseñas este curso")
    if payload.room_id is not None and db.get(Room, payload.room_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Room not found")

    is_admin = current_user.role == UserRole.admin
    proposal = LocationProposal(
        schedule_id=schedule_id,
        proposed_by=current_user.id,
        modality=payload.modality,
        room_id=payload.room_id,
        provider=payload.provider,
        join_url=payload.join_url,
        status=ProposalStatus.approved if is_admin else ProposalStatus.pending,
    )
    if is_admin:
        if payload.modality == Modality.presencial and payload.room_id is not None:
            _reject_room_clash(db, schedule, payload.room_id)
        proposal.reviewed_by = current_user.id
        _apply_to_schedule(schedule, proposal)
    db.add(proposal)
    db.commit()
    db.refresh(proposal)
    return proposal


@router.get("/location-proposals", response_model=list[LocationProposalRead])
def list_proposals(
    status_filter: ProposalStatus | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(staff_only),
) -> list[LocationProposal]:
    """Admins see every proposal; a teacher sees only their own."""
    stmt = select(LocationProposal)
    if current_user.role == UserRole.teacher:
        stmt = stmt.where(LocationProposal.proposed_by == current_user.id)
    if status_filter is not None:
        stmt = stmt.where(LocationProposal.status == status_filter)
    return list(db.scalars(stmt.order_by(LocationProposal.id.desc())).all())


def _pending_or_404(db: Session, proposal_id: int) -> LocationProposal:
    proposal = db.get(LocationProposal, proposal_id)
    if proposal is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Proposal not found")
    if proposal.status is not ProposalStatus.pending:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "La propuesta ya fue revisada"
        )
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
    proposal = _pending_or_404(db, proposal_id)
    schedule = db.get(Schedule, proposal.schedule_id)
    if schedule is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Schedule not found")
    if proposal.modality == Modality.presencial and proposal.room_id is not None:
        _reject_room_clash(db, schedule, proposal.room_id)
    before = snapshot(proposal)
    proposal.status = ProposalStatus.approved
    proposal.reviewed_by = current_user.id
    _apply_to_schedule(schedule, proposal)
    record(db, current_user, "update", "location_proposal", proposal.id, before, snapshot(proposal))
    db.commit()
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
    proposal = _pending_or_404(db, proposal_id)
    before = snapshot(proposal)
    proposal.status = ProposalStatus.rejected
    proposal.reviewed_by = current_user.id
    proposal.review_note = payload.note
    record(db, current_user, "update", "location_proposal", proposal.id, before, snapshot(proposal))
    db.commit()
    db.refresh(proposal)
    return proposal
