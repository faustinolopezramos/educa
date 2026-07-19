import type { User, LoginResponse, Enrollment, Course } from "../lib/types";

export const createUser = (overrides?: Partial<User>): User => ({
  id: 1,
  email: "user@educa.com",
  full_name: "Test User",
  role: "student",
  timezone: "UTC",
  ...overrides,
});

export const createLoginResponse = (
  overrides?: Partial<LoginResponse>,
): LoginResponse => ({
  access_token: "test_token_123",
  user: createUser(),
  ...overrides,
});

export const createEnrollment = (overrides?: Partial<Enrollment>): Enrollment => ({
  id: 1,
  student_id: 1,
  course_id: 1,
  status: "active",
  payment_status: "paid",
  enrolled_at: "2026-01-01T00:00:00Z",
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
