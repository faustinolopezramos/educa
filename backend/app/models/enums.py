import enum


class UserRole(str, enum.Enum):
    superadmin = "superadmin"
    admin = "admin"
    assistant = "assistant"
    teacher = "teacher"
    student = "student"


class Permission(str, enum.Enum):
    """What an `assistant` may be granted a slice of.

    An assistant is an admin whose reach was cut down to a named list, so every
    permission here corresponds to a section of the admin panel. The list used to
    live only in the frontend as a TypeScript union, which meant the API accepted
    any string at all: a permission stored as ``"manage_finances"`` looked right
    in the form, saved without complaint, and silently granted nothing.

    Roles other than `assistant` ignore these entirely — an admin holds all of
    them implicitly, a teacher and a student none.
    """

    manage_teachers = "manage_teachers"
    manage_students = "manage_students"
    manage_catalog = "manage_catalog"
    manage_schedules = "manage_schedules"
    manage_enrollments = "manage_enrollments"
    manage_finance = "manage_finance"
    manage_grades = "manage_grades"
    view_reports = "view_reports"


class EnrollmentStatus(str, enum.Enum):
    """The lifecycle of a matrícula (enrollment) — this *is* the student's
    academic status; there is deliberately no separate per-student status.

    `certified` and `withdrawn` are the renamed `completed`/`cancelled` values
    from the original 3-state enum — same meaning, names aligned to the
    business's own vocabulary (Certificado/Desistió).
    """

    enrolled = "enrolled"
    active = "active"
    inactive = "inactive"
    certified = "certified"
    withdrawn = "withdrawn"


# --- What the five states actually *mean* ------------------------------------
#
# Three questions get asked of an enrollment all over the codebase, and each one
# used to be answered with its own inline tuple of statuses. They disagreed: the
# cupo counted only `active`, the lobby admitted `active` and `enrolled`, and the
# attendance roster counted only `active` again — so a student sitting in
# "Inscrito" could walk into the virtual classroom of a course whose register
# they did not appear on, without ever occupying a seat.
#
# The sets below are the single answer to each question. They are deliberately
# separate even where they currently coincide: "holds a seat" and "may enter the
# classroom" are different questions, and the business may well want to move one
# without the other.

#: Holds a seat in the course. Counts against `max_students`, appears in the
#: roster the teacher takes attendance from, and takes part in timetable-clash
#: detection. A paused ("Inactivo") enrollment releases its seat — which is why
#: reactivating one has to re-check capacity.
ENROLLMENT_OCCUPIES_SEAT: frozenset[EnrollmentStatus] = frozenset(
    {EnrollmentStatus.enrolled, EnrollmentStatus.active}
)

#: May reach the class itself: the lobby, the session detail, assignments, and
#: the notifications sent when a class is cancelled or moved. Someone who has
#: paused, finished or dropped the course has no live class to reach.
ENROLLMENT_HAS_ACCESS: frozenset[EnrollmentStatus] = frozenset(
    {EnrollmentStatus.enrolled, EnrollmentStatus.active}
)

#: Still carries a live financial obligation, so its payment status is worth
#: re-deriving and its debt can make the student delinquent. A course that was
#: certified or dropped is closed out; whatever it left owing is collected
#: outside this lifecycle.
ENROLLMENT_OWES: frozenset[EnrollmentStatus] = frozenset(
    {
        EnrollmentStatus.enrolled,
        EnrollmentStatus.active,
        EnrollmentStatus.inactive,
    }
)

#: The states an enrollment may be *created* in. A brand-new matrícula cannot
#: start out certified or withdrawn, and `inactive` describes a pause of
#: something that already ran.
ENROLLMENT_OPENING_STATES: frozenset[EnrollmentStatus] = frozenset(
    {EnrollmentStatus.enrolled, EnrollmentStatus.active}
)

#: Which states each state may move to. `certified` and `withdrawn` are terminal
#: on purpose: a certificate has been issued against the first, and re-admitting
#: a student who dropped out is a *new* matrícula with its own code — which the
#: partial unique index on (student, course) already allows.
ENROLLMENT_TRANSITIONS: dict[EnrollmentStatus, frozenset[EnrollmentStatus]] = {
    EnrollmentStatus.enrolled: frozenset(
        {
            EnrollmentStatus.active,
            EnrollmentStatus.inactive,
            EnrollmentStatus.withdrawn,
        }
    ),
    EnrollmentStatus.active: frozenset(
        {
            EnrollmentStatus.inactive,
            EnrollmentStatus.certified,
            EnrollmentStatus.withdrawn,
        }
    ),
    EnrollmentStatus.inactive: frozenset(
        {EnrollmentStatus.active, EnrollmentStatus.withdrawn}
    ),
    EnrollmentStatus.certified: frozenset(),
    EnrollmentStatus.withdrawn: frozenset(),
}

#: Human labels, so an error message can name a state the way the panel does.
ENROLLMENT_STATUS_LABELS: dict[EnrollmentStatus, str] = {
    EnrollmentStatus.enrolled: "Inscrito",
    EnrollmentStatus.active: "Activo",
    EnrollmentStatus.inactive: "Inactivo",
    EnrollmentStatus.certified: "Certificado",
    EnrollmentStatus.withdrawn: "Desistió",
}


def enrollment_transition_allowed(
    current: EnrollmentStatus, target: EnrollmentStatus
) -> bool:
    """Whether an enrollment may move from `current` to `target`.

    Staying put is always allowed: a PATCH that resends the status it already
    has is a no-op, not an illegal move.
    """
    if current == target:
        return True
    return target in ENROLLMENT_TRANSITIONS.get(current, frozenset())


class CourseStatus(str, enum.Enum):
    """Where a course is in its own life, as opposed to in the calendar.

    A course used to have no state at all: whether it was still being set up,
    taking enrolments, running or finished had to be guessed from
    `start_date`/`end_date`. So a half-built course with no timetable and no
    teacher looked exactly like one about to start, and nothing stopped an admin
    from seating students in it.
    """

    draft = "draft"
    open = "open"
    in_progress = "in_progress"
    closed = "closed"
    archived = "archived"


#: Courses that accept new enrolments. A draft is not ready for students and a
#: closed one is over; late enrolment into a running course is normal, so
#: `in_progress` stays open.
COURSE_ACCEPTS_ENROLMENT: frozenset[CourseStatus] = frozenset(
    {CourseStatus.open, CourseStatus.in_progress}
)

#: Courses that count as "activos" for the academy: being taught or about to be.
COURSE_IS_ACTIVE: frozenset[CourseStatus] = frozenset(
    {CourseStatus.open, CourseStatus.in_progress}
)

#: Hidden from the default listing — kept for the record, not for working with.
COURSE_IS_ARCHIVED: frozenset[CourseStatus] = frozenset({CourseStatus.archived})

COURSE_TRANSITIONS: dict[CourseStatus, frozenset[CourseStatus]] = {
    # Setting one up: it can open for enrolment, or be shelved.
    CourseStatus.draft: frozenset({CourseStatus.open, CourseStatus.archived}),
    # Taking enrolments: it starts, goes back to the drawing board, or is shelved.
    CourseStatus.open: frozenset(
        {CourseStatus.in_progress, CourseStatus.draft, CourseStatus.archived}
    ),
    # Running: the only way out is finishing it.
    CourseStatus.in_progress: frozenset({CourseStatus.closed}),
    # Finished: archive it, or reopen to correct something.
    CourseStatus.closed: frozenset({CourseStatus.archived, CourseStatus.in_progress}),
    # Archived is the end of the line: bringing a course back is a new course.
    CourseStatus.archived: frozenset(),
}

COURSE_STATUS_LABELS: dict[CourseStatus, str] = {
    CourseStatus.draft: "Borrador",
    CourseStatus.open: "Abierto a matrícula",
    CourseStatus.in_progress: "En curso",
    CourseStatus.closed: "Cerrado",
    CourseStatus.archived: "Archivado",
}


def course_transition_allowed(current: CourseStatus, target: CourseStatus) -> bool:
    """Whether a course may move from `current` to `target`.

    Staying put is always allowed: a PATCH resending the status it already has
    is a no-op, not an illegal move.
    """
    if current == target:
        return True
    return target in COURSE_TRANSITIONS.get(current, frozenset())


class PaymentStatus(str, enum.Enum):
    pending = "pending"
    paid = "paid"
    overdue = "overdue"


class AttendanceStatus(str, enum.Enum):
    present = "present"
    absent = "absent"
    late = "late"
    excused = "excused"


class ProviderName(str, enum.Enum):
    manual = "manual"
    zoom = "zoom"
    google = "google"
    teams = "teams"


class MeetingStatus(str, enum.Enum):
    scheduled = "scheduled"
    live = "live"
    ended = "ended"
    cancelled = "cancelled"


class SessionStatus(str, enum.Enum):
    scheduled = "scheduled"
    held = "held"
    cancelled = "cancelled"


class Modality(str, enum.Enum):
    presencial = "presencial"
    semi_presencial = "semi_presencial"
    virtual = "virtual"


class TrackKind(str, enum.Enum):
    """What a `Language` row actually represents — it stopped being just
    human languages once the catalog grew to cover non-language tracks
    (Competencias Digitales/Negocios). Purely a display-grouping label for
    the Catálogo Académico; it does not change how Level/Course behave."""

    language = "language"
    digital_skill = "digital_skill"
    business_skill = "business_skill"


class PaymentKind(str, enum.Enum):
    """A ledger entry is either a charge owed (cobro) or a payment received
    (pago). The running balance of an enrollment is sum(charge) - sum(payment)."""

    charge = "charge"
    payment = "payment"


class ProposalStatus(str, enum.Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"
