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
}

export interface Room {
  id: number;
  name: string;
  capacity: number | null;
  is_virtual: boolean;
}

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
}

export interface AvailableTeacher {
  id: number;
  full_name: string;
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
}

export type AttendanceStatus = "present" | "absent" | "late" | "excused";

export interface Attendance {
  id: number;
  enrollment_id: number;
  date: string;
  status: AttendanceStatus;
}

export interface Grade {
  id: number;
  enrollment_id: number;
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
