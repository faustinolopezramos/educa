export type Role = "superadmin" | "admin" | "teacher" | "student";

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
  phone: string | null;
  address: string | null;
  cui_passport?: string | null;
  nationality_id: number | null;
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

export interface Course {
  id: number;
  level_id: number;
  name: string;
  start_date: string | null;
  end_date: string | null;
  max_students: number;
  passing_score: number;
}

export interface CourseEvaluation {
  id: number;
  course_id: number;
  name: string;
  weight: number;
}

export interface FinalGradeComponent {
  name: string;
  score: number;
  weight: number;
}

export interface FinalGrade {
  enrollment_id: number;
  final_score: number | null;
  passing_score: number;
  passed: boolean;
  components: FinalGradeComponent[];
}

export interface Certificate {
  id: number;
  enrollment_id: number;
  level_id: number;
  final_score: number;
  code: string;
  issued_at: string;
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
}

export type PaymentKind = "charge" | "payment";

export interface Payment {
  id: number;
  enrollment_id: number;
  kind: PaymentKind;
  amount: number;
  method: string | null;
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
  attendance_rate: number | null;
  attendance_by_course: CourseAttendance[];
  grades_recorded: number;
  grade_average: number | null;
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
