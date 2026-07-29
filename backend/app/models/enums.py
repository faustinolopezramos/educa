import enum


class UserRole(str, enum.Enum):
    superadmin = "superadmin"
    admin = "admin"
    teacher = "teacher"
    student = "student"


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
