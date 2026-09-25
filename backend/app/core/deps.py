from collections.abc import Callable

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import Select, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import decode_token
from app.models import (
    ENROLLMENT_HAS_ACCESS,
    ENROLLMENT_OWES,
    Course,
    CourseTeacher,
    Enrollment,
    PaymentStatus,
    Permission,
    User,
    UserRole,
)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")

_credentials_exc = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Could not validate credentials",
    headers={"WWW-Authenticate": "Bearer"},
)


def get_current_user(
    token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)
) -> User:
    payload = decode_token(token)
    if payload is None or payload.get("type") != "access":
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
    token_ver = payload.get("ver")
    if token_ver is not None and user.token_version != token_ver:
        raise _credentials_exc
    # Deactivating an account has to take effect on the sessions already open,
    # not just at the next login — otherwise a teacher given their baja keeps
    # working for up to the lifetime of their access token.
    if not user.is_active:
        raise _credentials_exc
    return user


# A superadmin is an admin plus tenant management, not a parallel role: every
# door an admin can open, they can open too. Kept as a tuple so the "is this
# caller staff-with-admin-powers?" question has exactly one answer in the
# codebase, instead of a `role == UserRole.admin` comparison per router that
# silently locks the superadmin out.
ADMIN_ROLES: tuple[UserRole, ...] = (UserRole.admin, UserRole.superadmin)


def is_admin(user: User) -> bool:
    """True for both admin and superadmin — use instead of `role == admin`."""
    return user.role in ADMIN_ROLES


# ---------------- Tenant scoping ----------------
#
# Which academy a caller belongs to is read from their own user row, never from
# anything the request carries — letting the client name its tenant would make
# "whose data is this?" something the caller gets to choose.
#
# A NULL `tenant_id` means "belongs to no single academy", which is how a
# superadmin operates across all of them. That is why the filters below are
# no-ops for such a caller: it is the same convention the meeting-provider and
# assignment endpoints already used, lifted here so every router answers the
# question the same way.


def apply_tenant(stmt: Select, column, user: User) -> Select:
    """Confine a query to the caller's academy.

    `column` is the `tenant_id` of whatever table the statement selects from (or
    of a table already joined into it).
    """
    if user.tenant_id is None:
        return stmt
    return stmt.where(column == user.tenant_id)


def in_tenant(user: User, obj: object | None) -> bool:
    """Whether a row carrying `tenant_id` belongs to the caller's academy.

    For single-row lookups (`db.get(...)`), where there is no statement to
    filter. A missing row is not in scope.
    """
    if obj is None:
        return False
    if user.tenant_id is None:
        return True
    return getattr(obj, "tenant_id", None) == user.tenant_id


def course_in_scope_or_404(db: Session, user: User, course_id: int) -> Course:
    """A course of the caller's academy, or 404.

    404 rather than 403: answering "forbidden" would confirm the course exists in
    *some* academy, which is itself a fact one academy should not learn.
    """
    course = db.get(Course, course_id)
    if not in_tenant(user, course):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Course not found")
    return course


def enrollment_in_scope_or_404(
    db: Session, user: User, enrollment_id: int
) -> Enrollment:
    """An enrollment of the caller's academy, or 404.

    An enrollment carries no `tenant_id`; it belongs to whichever academy owns
    its course, so that is the hop this makes. Three routers had grown their own
    copy of exactly this check and three more had none at all — grades,
    attendance and final grades among them — which is what made "did we scope
    this one?" a question you had to answer per endpoint. There is now one
    answer to reach for.
    """
    enrollment = db.get(Enrollment, enrollment_id)
    if enrollment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Enrollment not found")
    if not in_tenant(user, db.get(Course, enrollment.course_id)):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Enrollment not found")
    return enrollment


def tenant_course_ids(db: Session, user: User) -> list[int]:
    """Every course in the caller's academy.

    The entry point for scoping the tables that have no `tenant_id` of their own
    — enrollments, schedules, sessions, grades, payments — since all of them
    reach their academy through a course.
    """
    return list(
        db.scalars(apply_tenant(select(Course.id), Course.tenant_id, user)).all()
    )


def has_user_permission(user: User, permission: str | Permission) -> bool:
    """True if the user is an admin/superadmin or an assistant holding `permission`.

    Accepts the enum or its string value so callers can pass either; the stored
    list is plain JSON strings.
    """
    wanted = permission.value if isinstance(permission, Permission) else permission
    if user.role in ADMIN_ROLES:
        return True
    if user.role == UserRole.assistant:
        return wanted in (user.permissions or [])
    return False


def require_permission(permission: str | Permission) -> Callable[..., User]:
    """Admin/superadmin, or an assistant granted `permission`. No teachers."""
    wanted = permission.value if isinstance(permission, Permission) else permission

    def dependency(current_user: User = Depends(get_current_user)) -> User:
        if has_user_permission(current_user, wanted):
            return current_user
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Permiso insuficiente: requiere '{wanted}'",
        )

    return dependency


def require_staff_permission(permission: str | Permission) -> Callable[..., User]:
    """The teaching-floor equivalent of `require_permission`.

    Admins pass, teachers pass, and an assistant passes only with `permission`.
    These are the endpoints a teacher genuinely needs — taking attendance,
    grading, running a class — where the role check is only the outer gate and
    each endpoint still narrows a teacher to the courses they actually teach.

    It exists because the old `require_role(admin, teacher)` on those endpoints
    had no idea the `assistant` role existed, so an assistant holding
    `manage_grades` was shown a gradebook the API then refused to open.
    """
    wanted = permission.value if isinstance(permission, Permission) else permission

    def dependency(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role == UserRole.teacher or has_user_permission(
            current_user, wanted
        ):
            return current_user
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Permiso insuficiente: requiere '{wanted}'",
        )

    return dependency


def require_role(*roles: UserRole) -> Callable[[User], User]:
    def dependency(current_user: User = Depends(get_current_user)) -> User:
        allowed = set(roles)
        # Anything an admin may do, a superadmin may do. The reverse does not
        # hold: `require_role(superadmin)` still keeps plain admins out of the
        # tenant endpoints.
        if UserRole.admin in allowed:
            allowed.add(UserRole.superadmin)
        if current_user.role not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )
        return current_user

    return dependency


def teacher_teaches_course(db: Session, teacher_id: int, course_id: int) -> bool:
    """True if the teacher is assigned to the given course.

    Assignment (`course_teachers`), not scheduling, is the source of truth:
    a teacher assigned but not yet scheduled still teaches the course, and every
    schedule's teacher is required to be assigned, so this stays a superset.
    """
    return (
        db.scalar(
            select(CourseTeacher.id).where(
                CourseTeacher.teacher_id == teacher_id,
                CourseTeacher.course_id == course_id,
            )
        )
        is not None
    )


def teacher_course_ids(db: Session, teacher_id: int) -> list[int]:
    """Distinct course IDs the teacher is assigned to."""
    return list(
        db.scalars(
            select(CourseTeacher.course_id)
            .where(CourseTeacher.teacher_id == teacher_id)
            .distinct()
        ).all()
    )


def student_is_solvent(db: Session, student_id: int) -> bool:
    """False when the student has an unsettled enrollment with an overdue payment.

    "Solvente" here mirrors the dashboard's payment nudge: an `overdue` cuota is
    the delinquent state, while `pending` is simply not-yet-due. Withdrawn or
    graduated enrollments don't count — they no longer carry a live obligation.
    A *paused* one still does: pausing a course does not forgive its debt.
    """
    delinquent = db.scalar(
        select(Enrollment.id).where(
            Enrollment.student_id == student_id,
            Enrollment.status.in_(ENROLLMENT_OWES),
            Enrollment.payment_status == PaymentStatus.overdue,
        )
    )
    return delinquent is None


def student_course_ids(db: Session, student_id: int) -> list[int]:
    """Distinct course IDs whose classroom the student may reach.

    Paused, graduated and withdrawn enrollments are excluded: they no longer
    grant access to a live classroom.
    """
    return list(
        db.scalars(
            select(Enrollment.course_id)
            .where(
                Enrollment.student_id == student_id,
                Enrollment.status.in_(ENROLLMENT_HAS_ACCESS),
            )
            .distinct()
        ).all()
    )
