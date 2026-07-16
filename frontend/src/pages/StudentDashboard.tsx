import { Link } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";
import { Badge, Card, PageTitle } from "../components/ui";
import { StudentGrades } from "../features/grades/StudentGrades";
import {
  DAYS,
  ENROLLMENT_LABELS,
  PAYMENT_LABELS,
  formatDateTime,
  formatTime,
  timeZoneLabel,
} from "../lib/format";
import {
  useCourses,
  useEnrollments,
  useGrades,
  useMeetings,
  useMyAttendance,
  usePublicTeachers,
  useRooms,
  useSchedules,
} from "../lib/queries";
import type { Enrollment } from "../lib/types";

// Meetings become "joinable" from the Lobby 15 min before start, and the window
// closes at end_time (or, if unknown, a 2h grace after start).
const LOBBY_WINDOW_MIN = 15;
const GRACE_MS = 2 * 60 * 60_000;

export function StudentDashboard() {
  const { user } = useAuth();
  const tz = user?.timezone;
  const { data: enrollments = [] } = useEnrollments();
  const { data: courses = [] } = useCourses();
  const { data: schedules = [] } = useSchedules();
  const { data: meetings = [] } = useMeetings();
  const { data: teachers = [] } = usePublicTeachers();
  const { data: rooms = [] } = useRooms();
  const { data: attendance = [] } = useMyAttendance();
  const { data: grades = [] } = useGrades();

  const now = Date.now();

  const courseName = (id: number) =>
    courses.find((c) => c.id === id)?.name ?? `#${id}`;
  const teacherName = (id: number) =>
    teachers.find((t) => t.id === id)?.full_name ?? "—";
  const roomName = (id: number | null) =>
    id == null ? null : (rooms.find((r) => r.id === id)?.name ?? null);

  const myCourseIds = new Set(enrollments.map((e) => e.course_id));
  const mySchedules = schedules
    .filter((s) => myCourseIds.has(s.course_id))
    .sort(
      (a, b) =>
        a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time),
    );
  const scheduleById = new Map(schedules.map((s) => [s.id, s]));

  // Upcoming meetings only: keep those whose lobby window has not yet closed.
  const myMeetings = meetings
    .filter((m) => scheduleById.has(m.schedule_id))
    .map((m) => {
      const start = new Date(m.start_time).getTime();
      const closeAt = m.end_time ? new Date(m.end_time).getTime() : start + GRACE_MS;
      const opensAt = start - LOBBY_WINDOW_MIN * 60_000;
      const active = m.status !== "ended" && m.status !== "cancelled";
      return { m, start, opensAt, closeAt, active };
    })
    .filter((x) => x.closeAt > now && x.active)
    .sort((a, b) => a.start - b.start);

  // Per-course attendance % and grade average, keyed by enrollment.
  const statsByCourse = new Map<
    number,
    { attendancePct: number | null; average: number | null }
  >();
  for (const e of enrollments) {
    const att = attendance.filter((a) => a.enrollment_id === e.id);
    const attended = att.filter(
      (a) => a.status === "present" || a.status === "late",
    ).length;
    const attendancePct = att.length ? Math.round((attended / att.length) * 100) : null;
    const gr = grades.filter((g) => g.enrollment_id === e.id);
    const average = gr.length
      ? Math.round((gr.reduce((s, g) => s + g.score, 0) / gr.length) * 10) / 10
      : null;
    statsByCourse.set(e.course_id, { attendancePct, average });
  }

  const nextClassForCourse = (courseId: number): string | null => {
    const courseScheduleIds = new Set(
      schedules.filter((s) => s.course_id === courseId).map((s) => s.id),
    );
    const next = myMeetings.find((x) => courseScheduleIds.has(x.m.schedule_id));
    return next ? formatDateTime(next.m.start_time, tz) : null;
  };

  return (
    <div>
      <PageTitle>Mi Progreso</PageTitle>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h3 className="mb-3 font-medium">Próximas clases</h3>
          {myMeetings.length === 0 ? (
            <p className="text-sm text-slate-400">No tienes clases programadas.</p>
          ) : (
            <ul className="space-y-2">
              {myMeetings.map(({ m, opensAt }) => {
                const sched = scheduleById.get(m.schedule_id);
                const lobbyOpen = now >= opensAt;
                return (
                  <li
                    key={m.id}
                    className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  >
                    <div>
                      <div className="font-medium">
                        {sched ? courseName(sched.course_id) : "Clase"}
                      </div>
                      <div className="text-xs text-slate-500">
                        {formatDateTime(m.start_time, tz)}
                        {tz && ` (${timeZoneLabel(m.start_time, tz)})`}
                      </div>
                      {sched && (
                        <div className="text-xs text-slate-400">
                          {teacherName(sched.teacher_id)}
                          {roomName(sched.room_id) && ` · ${roomName(sched.room_id)}`}
                        </div>
                      )}
                    </div>
                    {lobbyOpen ? (
                      <Link
                        to={`/lobby/${m.id}`}
                        className="rounded-md bg-brand-600 px-3 py-1.5 text-white hover:bg-brand-700"
                      >
                        Entrar al Lobby
                      </Link>
                    ) : (
                      <span className="text-xs text-slate-400">Abre 15 min antes</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card>
          <h3 className="mb-3 font-medium">Mi horario semanal</h3>
          {mySchedules.length === 0 ? (
            <p className="text-sm text-slate-400">Sin clases en tu horario.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {mySchedules.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between rounded bg-slate-50 px-3 py-2"
                >
                  <div>
                    <div className="font-medium">{courseName(s.course_id)}</div>
                    <div className="text-xs text-slate-500">
                      {DAYS[s.day_of_week]} · {formatTime(s.start_time)}–
                      {formatTime(s.end_time)}
                    </div>
                  </div>
                  <div className="text-right text-xs text-slate-400">
                    <div>{teacherName(s.teacher_id)}</div>
                    {roomName(s.room_id) && <div>{roomName(s.room_id)}</div>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <h3 className="mb-3 font-medium">Mis cursos</h3>
          {enrollments.length === 0 ? (
            <p className="text-sm text-slate-400">No estás matriculado en ningún curso.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {enrollments.map((e) => (
                <CourseCard
                  key={e.id}
                  enrollment={e}
                  name={courseName(e.course_id)}
                  stats={statsByCourse.get(e.course_id)}
                  nextClass={nextClassForCourse(e.course_id)}
                />
              ))}
            </div>
          )}
        </Card>

        <div className="lg:col-span-2">
          <h3 className="mb-3 font-medium">Mis calificaciones</h3>
          <StudentGrades />
        </div>
      </div>
    </div>
  );
}

function CourseCard({
  enrollment,
  name,
  stats,
  nextClass,
}: {
  enrollment: Enrollment;
  name: string;
  stats?: { attendancePct: number | null; average: number | null };
  nextClass: string | null;
}) {
  const payColor =
    enrollment.payment_status === "paid"
      ? "green"
      : enrollment.payment_status === "overdue"
        ? "red"
        : "amber";
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="mb-2 flex items-start justify-between gap-2">
        <span className="font-medium">{name}</span>
        <Badge color={enrollment.status === "active" ? "green" : "slate"}>
          {ENROLLMENT_LABELS[enrollment.status] ?? enrollment.status}
        </Badge>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
        <span>
          Pago:{" "}
          <Badge color={payColor}>
            {PAYMENT_LABELS[enrollment.payment_status] ?? enrollment.payment_status}
          </Badge>
        </span>
        <span>
          Asistencia:{" "}
          <strong className="text-slate-700">
            {stats?.attendancePct != null ? `${stats.attendancePct}%` : "—"}
          </strong>
        </span>
        <span>
          Promedio:{" "}
          <strong className="text-slate-700">
            {stats?.average != null ? stats.average : "—"}
          </strong>
        </span>
      </div>
      {nextClass && (
        <div className="mt-2 text-xs text-slate-400">Próxima clase: {nextClass}</div>
      )}
    </div>
  );
}
