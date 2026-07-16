import { useState } from "react";

import {
  Badge,
  Button,
  Card,
  PageTitle,
  Table,
  Td,
  Th,
} from "../components/ui";
import { GradeTable } from "../features/grades/GradeTable";
import { dayName, formatDateTime, formatTime } from "../lib/format";
import {
  useCourseStudents,
  useCourses,
  useCreateAttendance,
  useEnrollments,
  useMeetings,
  useSchedules,
} from "../lib/queries";
import type { Schedule } from "../lib/types";

export function TeacherDashboard() {
  const { data: schedules = [] } = useSchedules(true);
  const { data: courses = [] } = useCourses();
  const [selected, setSelected] = useState<Schedule | null>(null);

  return (
    <div>
      <PageTitle>Mis Clases</PageTitle>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <h3 className="mb-3 font-medium">Horarios asignados</h3>
          {schedules.length === 0 && (
            <p className="text-sm text-slate-400">Sin horarios asignados.</p>
          )}
          <ul className="space-y-2">
            {schedules.map((s) => {
              const course = courses.find((c) => c.id === s.course_id);
              const isActive = selected?.id === s.id;
              return (
                <li key={s.id}>
                  <button
                    onClick={() => setSelected(s)}
                    className={`w-full rounded-lg border p-3 text-left text-sm transition ${
                      isActive
                        ? "border-brand-500 bg-brand-50"
                        : "border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <div className="font-medium">{course?.name ?? s.course_id}</div>
                    <div className="text-xs text-slate-500">
                      {dayName(s.day_of_week)} · {formatTime(s.start_time)}–
                      {formatTime(s.end_time)}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
        <div className="lg:col-span-2">
          {selected ? (
            <ClassDetail schedule={selected} />
          ) : (
            <Card>
              <p className="text-sm text-slate-400">
                Selecciona un horario para pasar lista, calificar y ver las clases
                virtuales.
              </p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function ClassDetail({ schedule }: { schedule: Schedule }) {
  const { data: enrollments = [] } = useEnrollments(schedule.course_id);
  const { data: students = [] } = useCourseStudents(schedule.course_id);
  const { data: meetings = [] } = useMeetings(schedule.id);

  return (
    <div className="space-y-6">
      <Card>
        <h3 className="mb-3 font-medium">Clases virtuales</h3>
        {meetings.length === 0 ? (
          <p className="text-sm text-slate-400">No hay reuniones programadas.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {meetings.map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between rounded bg-slate-50 px-3 py-2"
              >
                <span>{formatDateTime(m.start_time)}</span>
                <div className="flex items-center gap-2">
                  <Badge color={m.status === "scheduled" ? "indigo" : "slate"}>
                    {m.status}
                  </Badge>
                  {m.host_url && (
                    <a
                      href={m.host_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-brand-600 hover:underline"
                    >
                      Iniciar (host)
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h3 className="mb-3 font-medium">Asistencia (hoy)</h3>
        <Table>
          <thead>
            <tr>
              <Th>Alumno</Th>
              <Th>Marcar</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {enrollments.map((e) => (
              <AttendanceRow
                key={e.id}
                enrollmentId={e.id}
                name={
                  students.find((s) => s.id === e.student_id)?.full_name ??
                  `#${e.student_id}`
                }
              />
            ))}
          </tbody>
        </Table>
      </Card>

      <GradeTable enrollments={enrollments} students={students} />
    </div>
  );
}

function AttendanceRow({
  enrollmentId,
  name,
}: {
  enrollmentId: number;
  name: string;
}) {
  const attendance = useCreateAttendance();
  const today = new Date().toISOString().slice(0, 10);

  return (
    <tr>
      <Td>{name}</Td>
      <Td>
        <div className="flex gap-1">
          {(["present", "late", "absent"] as const).map((st) => (
            <Button
              key={st}
              variant="secondary"
              className="px-2 py-1 text-xs"
              disabled={attendance.isPending}
              onClick={() =>
                attendance.mutate({
                  enrollment_id: enrollmentId,
                  date: today,
                  status: st,
                })
              }
            >
              {st === "present" ? "Presente" : st === "late" ? "Tarde" : "Ausente"}
            </Button>
          ))}
        </div>
      </Td>
    </tr>
  );
}
