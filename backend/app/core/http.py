"""HTTP-shaped helpers over database errors."""

from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session


def commit_or_conflict(db: Session, detail: Any) -> None:
    """Commit, turning a constraint violation into a 409 instead of a 500.

    The schema enforces rules the endpoint has usually already checked in
    Python (double-booking, one mark per day, one score per evaluation). That
    check and the commit are not atomic, so a concurrent writer can still lose
    the race — and a course-wide change can move rows into a clash the request
    never inspected. Either way the caller asked for something the data model
    forbids, which is a conflict, not a server error.
    """
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail)
