export type Role = "superadmin" | "admin" | "assistant" | "teacher" | "student";

export type Permission =
  | "manage_teachers"
  | "manage_students"
  | "manage_catalog"
  | "manage_schedules"
  | "manage_enrollments"
  | "manage_finance"
  | "manage_grades"
  | "view_reports";

export interface Tenant {
  id: number;
  name: string;
  slug: string;
  logo_url: string | null;
  is_active: boolean;
  max_active_students: number;
  created_at: string;
  updated_at: string;
}

export interface User {
  id: number;
  tenant_id?: number | null;
  email: string;
  full_name: string;
  role: Role;
  timezone: string;
  max_weekly_hours: number | null;
  hourly_rate?: number | null;
  phone: string | null;
  address: string | null;
  cui_passport?: string | null;
  nationality_id: number | null;
  permissions?: Permission[];
  /** "Baja" is this flag, not a DELETE: a teacher's classes, grades and
   *  attendance have to survive them. An inactive account cannot log in. */
  is_active: boolean;
}

export interface Nationality {
  id: number;
  name: string;
}

/** Just enough to label a row. What the scoped roster endpoints return. */
export interface UserBrief {
  id: number;
  full_name: string;
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: User;
}

export interface TeacherLoad {
  teacher_id: number;
  assigned_hours: number;
  availability_hours: number;
  max_hours: number;
  percentage: number;
}

export type TrackKind = "language" | "digital_skill" | "business_skill";

export interface Language {
  id: number;
  name: string;
  kind: TrackKind;
}

export interface Level {
  id: number;
  language_id: number;
  code: string;
  name: string;
}

export type CourseStatus =
  | "draft"
  | "open"
  | "in_progress"
  | "closed"
  | "archived";

export interface Course {
  id: number;
  level_id: number;
  name: string;
  status: CourseStatus;
  start_date: string | null;
  end_date: string | null;
  periodicity?: string | null;
  max_students: number;
  passing_score: number;
  /** Seats held, teachers assigned and weekly slots — counted server-side so
   *  the panel does not fetch every enrolment in the academy to work them out. */
  seats_taken: number;
  teacher_count: number;
  schedule_count: number;
}

export type SkillCategory =
  | "speaking"
  | "listening"
  | "reading"
  | "writing"
  | "grammar"
  | "use_of_language";

export const SKILL_LABELS: Record<SkillCategory, string> = {
  speaking: "Speaking / Expresión Oral",
  listening: "Listening / Comprensión Auditiva",
  reading: "Reading / Comprensión Lectora",
  writing: "Writing / Expresión Escrita",
  grammar: "Grammar & Vocabulary",
  use_of_language: "Use of Language",
};

export interface CourseEvaluation {
  id: number;
  course_id: number;
  name: string;
  weight: number;
  skill?: SkillCategory | null;
}

export interface FinalGradeComponent {
  name: string;
  score: number;
  weight: number;
  skill?: SkillCategory | null;
}

export interface FinalGrade {
  enrollment_id: number;
  final_score: number | null;
  passing_score: number;
  passed: boolean;
  components: FinalGradeComponent[];
}

export interface Room {
  id: number;
  name: string;
  capacity: number | null;
  is_virtual: boolean;
}

export type Modality = "presencial" | "semi_presencial" | "virtual";
export type ProviderName = "manual" | "zoom" | "google" | "teams";
export type ProposalStatus = "pending" | "approved" | "rejected";

export interface Schedule {
  id: number;
  course_id: number;
  teacher_id: number;
  room_id: number | null;
  day_of_week: number;
  start_time: string;
  end_time: string;
  term_start: string | null;
  term_end: string | null;
  modality: Modality;
  join_url: string | null;
  provider: ProviderName | null;
}

export interface LocationProposal {
  id: number;
  schedule_id: number;
  proposed_by: number;
  modality: Modality;
  room_id: number | null;
  provider: ProviderName | null;
  join_url: string | null;
  status: ProposalStatus;
  review_note: string | null;
  reviewed_by: number | null;
}

export interface AvailableTeacher {
  id: number;
  full_name: string;
}

export interface CourseTeacher {
  id: number;
  course_id: number;
  teacher_id: number;
  is_lead: boolean;
  teacher_name: string;
}

export interface TeacherLanguage {
  id: number;
  teacher_id: number;
  language_id: number;
}

export interface TeacherAvailability {
  id: number;
  teacher_id: number;
  day_of_week: number;
  start_time: string;
  end_time: string;
}

export type EnrollmentStatus = "enrolled" | "active" | "inactive" | "certified" | "withdrawn";
export type PaymentStatus = "pending" | "paid" | "overdue";

export interface Enrollment {
  id: number;
  student_id: number;
  course_id: number;
  enrollment_code: string;
  status: EnrollmentStatus;
  payment_status: PaymentStatus;
  attendance_blocked: boolean;
  amount: number;
  /** `charged − paid` from the ledger: positive is owed, negative is credit. */
  balance: number;
}

export type PaymentKind = "charge" | "payment";

export interface Payment {
  id: number;
  enrollment_id: number;
  kind: PaymentKind;
  amount: number;
  method: string | null;
  receipt_number?: string | null;
  /** Only meaningful on a `charge`: when it falls due (YYYY-MM-DD). */
  due_date: string | null;
  paid_at: string;
  recorded_by: number | null;
  notes: string | null;
}

export interface EnrollmentLedger {
  enrollment_id: number;
  charged: number;
  paid: number;
  balance: number;
  movements: Payment[];
}

export interface Invoice {
  id: number;
  enrollment_id: number;
  code: string;
  total_amount: number;
  issued_at: string;
  issued_by: number | null;
}

export type SessionStatus = "scheduled" | "held" | "cancelled";

export interface ClassSession {
  id: number;
  schedule_id: number;
  date: string;
  status: SessionStatus;
  topic: string | null;
  cancel_reason: string | null;
  origin_session_id: number | null;
  recording_url?: string | null;
  /** Cuándo el profesor dio la lista por terminada. `null` = todavía abierta.
   *  `status` sólo dice si la clase ocurrió; esto dice si quedó registrada. */
  register_closed_at?: string | null;
  register_closed_by?: number | null;
}

export interface Assignment {
  id: number;
  tenant_id?: number | null;
  course_id: number;
  title: string;
  description: string | null;
  resource_url?: string | null;
  due_date: string | null;
  created_at: string;
}

export interface AssignmentSubmission {
  id: number;
  assignment_id: number;
  student_id: number;
  content: string | null;
  submission_url: string | null;
  submitted_at: string;
  status: "submitted" | "graded";
  score: number | null;
  feedback: string | null;
  is_late?: boolean;
  student?: UserBrief | null;
}

export interface RosterStudentStatus {
  student_id: number;
  full_name: string;
  status: "not_submitted" | "submitted" | "submitted_late" | "graded";
  submission_id?: number | null;
  submitted_at?: string | null;
  content?: string | null;
  submission_url?: string | null;
  score?: number | null;
  feedback?: string | null;
  is_late?: boolean;
}

export interface Holiday {
  id: number;
  date: string;
  name: string;
}

export type AttendanceStatus = "present" | "absent" | "late" | "excused";

export interface Attendance {
  id: number;
  enrollment_id: number;
  session_id: number;
  date: string;
  status: AttendanceStatus;
}

export interface Grade {
  id: number;
  enrollment_id: number;
  session_id: number | null;
  evaluation_name: string;
  score: number;
  skill?: SkillCategory | null;
}

export interface BulkAttendanceItem {
  enrollment_id: number;
  status: AttendanceStatus;
}

export interface BulkAttendanceRequest {
  items: BulkAttendanceItem[];
}

export interface BulkAttendanceResponse {
  session_id: number;
  total_processed: number;
  created_count: number;
  updated_count: number;
  records: Attendance[];
}

export interface ConflictInfo {
  schedule_id: number;
  course_id: number;
  course_name: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
}

export interface ConflictResponse {
  conflicts: ConflictInfo[];
  room_conflicts: ConflictInfo[];
  warnings: string[];
}

export type ReportPeriod = "day" | "week" | "month";

export interface CourseAttendance {
  course_id: number;
  course_name: string;
  present: number;
  total: number;
  rate: number | null;
}

export interface AtRiskStudent {
  student_id: number;
  student_name: string;
  course_id: number;
  course_name: string;
  attendance_rate: number | null;
  average: number | null;
  reasons: string[];
}

export interface ConsolidatedStudentReport {
  student_id: number;
  student_name: string;
  course_id: number;
  course_name: string;
  // `null` = nothing recorded for that component in the period. Not a zero:
  // rendering it as one would report an ungraded student as a failing one.
  assignments_avg: number | null;
  assignments_completion_rate: number | null;
  exams_avg: number | null;
  attendance_rate: number | null;
  consolidated_score: number | null;
  performance_status: "optimal" | "warning" | "critical" | "no_data";
}

export interface Report {
  period: ReportPeriod;
  date_from: string;
  date_to: string;
  sessions_total: number;
  sessions_held: number;
  sessions_cancelled: number;
  /** Neither registered nor cancelled: still upcoming, or past with no register. */
  sessions_pending: number;
  attendance_rate: number | null;
  attendance_by_course: CourseAttendance[];
  grades_recorded: number;
  grade_average: number | null;
  skills_overview?: Record<string, number>;
  at_risk: AtRiskStudent[];
  consolidated_students?: ConsolidatedStudentReport[];
}

export interface Notification {
  id: number;
  kind: string;
  title: string;
  body: string;
  read_at: string | null;
  created_at: string;
}

export interface AuditLog {
  id: number;
  actor_id: number | null;
  action: "create" | "update" | "delete";
  entity: string;
  entity_id: number;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  at: string;
}

export type MeetingStatus = "scheduled" | "live" | "ended" | "cancelled";

export interface VirtualMeeting {
  id: number;
  schedule_id: number;
  provider_id: number;
  external_meeting_id: string | null;
  join_url: string | null;
  host_url: string | null;
  start_time: string;
  end_time: string | null;
  status: MeetingStatus;
  recording_url: string | null;
}

export interface LobbyJoinInfo {
  join_url: string | null;
  host_url: string | null;
  is_host: boolean;
  can_join: boolean;
  reason: string | null;
  minutes_remaining: number;
}

/** One thing waiting on the signed-in user, from `GET /dashboard`. */
export interface ActionItem {
  kind: string;
  label: string;
  count: number;
  severity: "critical" | "warning" | "info";
  /** The `?m=` section that resolves it, so an item is never a dead end. */
  section: string;
  detail: string | null;
  amount: number | null;
}

export interface DashboardSummary {
  role: Role;
  items: ActionItem[];
  /** Student only: total owed across their live enrollments. */
  balance_due: number;
  next_session_id: number | null;
  /** Staff only; `null` for everyone else. */
  kpis: AcademyKpis | null;
}

export interface AcademyKpis {
  active_courses: number;
  draft_courses: number;
  total_courses: number;
  active_students: number;
  active_teachers: number;
  seats_taken: number;
  seats_offered: number;
  /** `null` when no seats are offered — not the same as 0% and must not
   *  render as one. */
  occupancy_rate: number | null;
}

/** One student's outcome in a bulk enrolment. */
export interface BulkEnrollOutcome {
  student_id: number;
  student_name: string;
  ok: boolean;
  enrollment_id: number | null;
  enrollment_code: string | null;
  reason: string | null;
}

export interface BulkEnrollResult {
  created: number;
  failed: number;
  outcomes: BulkEnrollOutcome[];
}

/** One course's outcome in a teacher handover. */
export interface TeacherReassignOutcome {
  course_id: number;
  course_name: string;
  ok: boolean;
  schedules_moved: number;
  reason: string | null;
}

export interface TeacherReassignResult {
  moved: number;
  failed: number;
  outcomes: TeacherReassignOutcome[];
}

/** A live course still tied to a teacher — what a baja would strand. */
export interface TeacherLiveAssignment {
  course_id: number;
  course_name: string;
  schedule_count: number;
}

export interface DeleteImpact {
  can_delete: boolean;
  reason?: string | null;
  levels_count: number;
  courses_count: number;
  enrollments_count: number;
  attendance_count: number;
  grades_count: number;
  payments_count: number;
  invoices_count: number;
  message: string;
}

export interface KardexSummary {
  global_gpa: number;
  overall_attendance_rate: number;
  total_courses_passed: number;
  total_courses_failed: number;
  person_status: string;
  person_status_label: string;
  outstanding_balance: number;
  skills_breakdown?: Record<string, number>;
}

export interface KardexCourseEntry {
  enrollment_id: number;
  course_id: number;
  course_title: string;
  level_name: string;
  status: string;
  status_label: string;
  enrollment_code: string;
  final_score?: number | null;
  passed?: boolean | null;
  balance: number;
  skills?: Record<string, number>;
}

export interface StudentKardexResponse {
  student_id: number;
  student_name: string;
  student_email: string;
  phone?: string | null;
  nationality?: string | null;
  summary: KardexSummary;
  history: KardexCourseEntry[];
}

export type MakeUpStatus = "available" | "booked" | "attended" | "expired" | "cancelled";

export const MAKEUP_STATUS_LABELS: Record<MakeUpStatus, string> = {
  available: "Disponible",
  booked: "Reservada",
  attended: "Completada",
  expired: "Expirada",
  cancelled: "Cancelada",
};

export interface MakeUpCredit {
  id: number;
  student_id: number;
  enrollment_id: number;
  origin_session_id?: number | null;
  target_session_id?: number | null;
  status: MakeUpStatus;
  issued_at: string;
  expires_at: string;
  notes?: string | null;
  student_name?: string | null;
  course_name?: string | null;
  level_name?: string | null;
  origin_session_date?: string | null;
  target_session_date?: string | null;
  target_session_time?: string | null;
  target_course_name?: string | null;
}

/**
 * Un alumno que asiste a una sesión recuperando una clase de otro grupo. No
 * tiene matrícula en ese curso, así que no sale en la lista normal: su presencia
 * cuelga del pase de recuperación.
 */
export interface MakeUpVisitor {
  credit_id: number;
  student_id: number;
  student_name: string;
  origin_course_name?: string | null;
  status: MakeUpStatus;
}

export interface CandidateSession {
  session_id: number;
  course_id: number;
  course_name: string;
  level_id: number;
  level_name: string;
  date: string;
  start_time: string;
  end_time: string;
  teacher_name: string;
  modality: Modality;
  room_name?: string | null;
  max_students: number;
  occupied_seats: number;
  available_seats: number;
}

export interface TeacherPayrollSessionItem {
  session_id: number;
  course_id: number;
  course_name: string;
  date: string;
  start_time: string;
  end_time: string;
  duration_hours: number;
  status: string;
  register_closed: boolean;
  hourly_rate: number;
  amount: number;
}

export interface TeacherPayrollReport {
  teacher_id: number;
  teacher_name: string;
  email: string;
  hourly_rate: number;
  date_from: string;
  date_to: string;
  total_sessions: number;
  total_hours: number;
  total_amount: number;
  sessions: TeacherPayrollSessionItem[];
}

export interface TeacherPayrollSummary {
  teacher_id: number;
  teacher_name: string;
  email: string;
  hourly_rate: number;
  total_sessions: number;
  total_hours: number;
  total_amount: number;
}

export interface AcademyPayrollSummary {
  date_from: string;
  date_to: string;
  total_teachers: number;
  total_hours: number;
  total_amount: number;
  teachers: TeacherPayrollSummary[];
}
