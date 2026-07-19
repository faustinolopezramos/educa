export type Role = "admin" | "teacher" | "student";

export interface User {
  id: number;
  email: string;
  full_name: string;
  role: Role;
  timezone: string;
  max_weekly_hours: number | null;
}

/** Just enough to label a row. What the scoped roster endpoints return. */
export interface UserBrief {
  id: number;
  full_name: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface Language {
  id: number;
  name: string;
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

export type Modality = "presencial" | "virtual";
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

export type EnrollmentStatus = "active" | "completed" | "cancelled";
export type PaymentStatus = "pending" | "paid" | "overdue";

export interface Enrollment {
  id: number;
  student_id: number;
  course_id: number;
  status: EnrollmentStatus;
  payment_status: PaymentStatus;
  attendance_blocked: boolean;
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
