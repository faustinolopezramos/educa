import enum


class UserRole(str, enum.Enum):
    admin = "admin"
    teacher = "teacher"
    student = "student"


class EnrollmentStatus(str, enum.Enum):
    active = "active"
    completed = "completed"
    cancelled = "cancelled"


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
    virtual = "virtual"


class ProposalStatus(str, enum.Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"
