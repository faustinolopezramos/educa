from collections.abc import Callable

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import decode_access_token
from app.models import Enrollment, EnrollmentStatus, Schedule, User, UserRole

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")

_credentials_exc = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Could not validate credentials",
    headers={"WWW-Authenticate": "Bearer"},
)


def get_current_user(
    token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)
) -> User:
    payload = decode_access_token(token)
    if payload is None:
        raise _credentials_exc
    sub = payload.get("sub")
    if sub is None:
        raise _credentials_exc
    try:
        user_id = int(sub)
    except (TypeError, ValueError):
        raise _credentials_exc
    user = db.get(User, user_id)
    if user is None:
        raise _credentials_exc
    return user


def require_role(*roles: UserRole) -> Callable[[User], User]:
    def dependency(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )
        return current_user

    return dependency


def teacher_teaches_course(db: Session, teacher_id: int, course_id: int) -> bool:
    """True if the teacher has at least one schedule in the given course."""
    return (
        db.scalar(
            select(Schedule.id).where(
                Schedule.teacher_id == teacher_id,
                Schedule.course_id == course_id,
            )
        )
        is not None
    )


def teacher_course_ids(db: Session, teacher_id: int) -> list[int]:
    """Distinct course IDs the teacher is assigned to (via schedules)."""
    return list(
        db.scalars(
            select(Schedule.course_id)
            .where(Schedule.teacher_id == teacher_id)
            .distinct()
        ).all()
    )


def student_course_ids(db: Session, student_id: int) -> list[int]:
    """Distinct course IDs the student is *actively* enrolled in.

    Cancelled/completed enrollments are excluded: they no longer grant access
    to a live classroom.
    """
    return list(
        db.scalars(
            select(Enrollment.course_id)
            .where(
                Enrollment.student_id == student_id,
                Enrollment.status == EnrollmentStatus.active,
            )
            .distinct()
        ).all()
    )
