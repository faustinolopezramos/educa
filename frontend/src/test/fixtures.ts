import type { User, LoginResponse, Enrollment, Course } from "../lib/types";

export const createUser = (overrides?: Partial<User>): User => ({
  id: 1,
  email: "user@educa.com",
  full_name: "Test User",
  role: "student",
  timezone: "UTC",
  max_weekly_hours: null,
  phone: null,
  address: null,
  nationality_id: null,
  ...overrides,
});

export const createLoginResponse = (
  overrides?: Partial<LoginResponse>,
): LoginResponse => ({
  access_token: "test_token_123",
  refresh_token: "test_refresh_456",
  token_type: "bearer",
  user: createUser(),
  ...overrides,
});

export const createEnrollment = (overrides?: Partial<Enrollment>): Enrollment => ({
  id: 1,
  student_id: 1,
  course_id: 1,
  enrollment_code: "2026-00001",
  status: "active",
  payment_status: "paid",
  attendance_blocked: false,
  amount: 0,
  ...overrides,
});

export const createCourse = (overrides?: Partial<Course>): Course => ({
  id: 1,
  level_id: 1,
  name: "Test Course",
  start_date: "2026-01-01",
  end_date: "2026-03-31",
  max_students: 20,
  passing_score: 6.0,
  ...overrides,
});
