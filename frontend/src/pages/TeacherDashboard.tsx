import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { PromptModal } from "../components/PromptModal";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  PageTitle,
  SectionHeading,
  Select,
} from "../components/ui";
import { GradeTable } from "../features/grades/GradeTable";
import { ReportView } from "../features/reports/ReportView";
import { apiErrorMessage } from "../lib/api";
import { dayName, formatTime, todayLocal } from "../lib/format";
import { notify } from "../lib/toast";
import {
  useCancelSession,
  useCourseStudents,
  useCourses,
  useCreateAttendance,
  useCreateGrade,
  useEnrollments,
  useEnsureSession,
  useGenerateSessions,
  useGrades,
  useLocationProposals,
  useProposeLocation,
  useRescheduleSession,
  useRooms,
  useSchedules,
  useSessions,
  useVisibleAttendance,
} from "../lib/queries";
import type {
  AttendanceStatus,
  ClassSession,
  Enrollment,
  Grade,
  Schedule,
} from "../lib/types";

function onMutationError(fallback: string) {
  return (e: unknown) => notify(apiErrorMessage(e, fallback), "error");
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

// Monday-first day index (matches format.DAYS), from a JS Date.
function localDow(d = new Date()): number {
  return (d.getDay() + 6) % 7;
}

export default function TeacherDashboard() {
  const [params] = useSearchParams();
  const section = params.get("m") ?? "clases";

  if (section === "reportes") {
    return (
      <div>
        <PageTitle subtitle="Solo tus cursos">Reporte de mis clases</PageTitle>
        <ReportView />
      </div>
    );
  }
  return <ClassesView />;
}

function ClassesView() {
  const { data: schedules = [] } = useSchedules(true);
  const { data: courses = [] } = useCourses();
  const [selected, setSelected] = useState<Schedule | null>(null);

  const courseName = (id: number) => courses.find((c) => c.id === id)?.name ?? `#${id}`;

  return (
    <div>
      <PageTitle subtitle="Docencia">Mis clases</PageTitle>

      <NowBar
        schedules={schedules}
        courseName={courseName}
        onGo={(s) => setSelected(s)}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <SectionHeading>Horarios asignados</SectionHeading>
          {schedules.length === 0 ? (
            <EmptyState
              icon="◷"
              title="Sin horarios asignados"
              message="Cuando dirección te asigne un curso y su horario, tus clases aparecerán aquí."
            />
          ) : (
            <ul className="space-y-2">
              {schedules.map((s) => {
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
                      <div className="font-medium text-slate-800">
                        {courseName(s.course_id)}
                      </div>
                      <div className="mt-0.5 font-mono text-xs text-slate-500">
                        {dayName(s.day_of_week)} · {formatTime(s.start_time)}–
                        {formatTime(s.end_time)}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
        <div className="lg:col-span-2">
          {selected ? (
            <ClassDetail schedule={selected} />
          ) : (
            <Card>
              <EmptyState
                icon="✎"
                title="Elige una clase"
                message="Selecciona un horario para proponer dónde darás la clase, pasar lista y calificar."
              />
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

// Highlights the class happening now (or the next one this week) with one tap in.
function NowBar({
  schedules,
  courseName,
  onGo,
}: {
  schedules: Schedule[];
  courseName: (id: number) => string;
  onGo: (s: Schedule) => void;
}) {
  const navigate = useNavigate();
  const ensure = useEnsureSession();

  function enterLobby(s: Schedule) {
    ensure.mutate(
      { schedule_id: s.id, date: todayLocal() },
      {
        onSuccess: (session) => navigate(`/lobby/${session.id}`),
        onError: onMutationError("No se pudo abrir el lobby"),
      },
    );
  }

  const featured = useMemo(() => {
    if (schedules.length === 0) return null;
    const today = localDow();
    const now = new Date();
    const nowStr = `${String(now.getHours()).padStart(2, "0")}:${String(
      now.getMinutes(),
    ).padStart(2, "0")}:00`;

    // Ongoing or next class today.
    const todays = schedules
      .filter((s) => s.day_of_week === today)
      .sort((a, b) => a.start_time.localeCompare(b.start_time));
    const live = todays.find((s) => s.start_time <= nowStr && s.end_time >= nowStr);
    if (live) return { s: live, when: "ahora", live: true };
    const nextToday = todays.find((s) => s.start_time > nowStr);
    if (nextToday) return { s: nextToday, when: "hoy", live: false };

    // Otherwise the soonest class later in the week.
    const upcoming = [...schedules].sort((a, b) => {
      const da = (a.day_of_week - today + 7) % 7 || 7;
      const db = (b.day_of_week - today + 7) % 7 || 7;
      return da - db || a.start_time.localeCompare(b.start_time);
    })[0];
    return { s: upcoming, when: dayName(upcoming.day_of_week), live: false };
  }, [schedules]);

  if (!featured) return null;
  const { s, when, live } = featured;

  return (
    <div className="mb-6 flex flex-wrap items-center gap-5 rounded-2xl bg-slate-900 px-6 py-5 text-slate-50">
      <div className="border-r border-slate-700 pr-5 text-center">
        <div className="font-mono text-[11px] uppercase tracking-wide text-slate-400">
          {live ? "Ahora" : "Próxima"}
        </div>
        <div className="font-mono text-2xl font-bold text-amber-500">
          {formatTime(s.start_time)}
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2.5">
          <h3 className="font-serif text-xl font-medium">{courseName(s.course_id)}</h3>
          {live && (
            <span className="rounded-full bg-brand-600 px-2.5 py-0.5 text-[11px] font-bold uppercase">
              En curso
            </span>
          )}
        </div>
        <div className="mt-0.5 text-sm text-slate-400">
          {formatTime(s.start_time)}–{formatTime(s.end_time)} ·{" "}
          {s.modality === "virtual" ? "Virtual" : "Presencial"} ·{" "}
          {when === "ahora" ? "en curso" : `${when}`}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {(when === "ahora" || when === "hoy") && (
          <Button disabled={ensure.isPending} onClick={() => enterLobby(s)}>
            {ensure.isPending ? "Abriendo…" : "Entrar al lobby →"}
          </Button>
        )}
        <Button
          variant={when === "ahora" || when === "hoy" ? "secondary" : "primary"}
          onClick={() => onGo(s)}
        >
          Ir a la clase →
        </Button>
      </div>
    </div>
  );
}

// Daily grade recorded per class session.
const DAILY_EVALUATION = "Nota del día";

function ClassDetail({ schedule }: { schedule: Schedule }) {
  const { data: enrollments = [] } = useEnrollments(schedule.course_id);
  const { data: students = [] } = useCourseStudents(schedule.course_id);
  const { data: sessions = [] } = useSessions(schedule.id);
  const generate = useGenerateSessions();

  const [sessionId, setSessionId] = useState<number | null>(null);

  const today = todayLocal();
  useEffect(() => {
    if (sessions.length === 0) {
      setSessionId(null);
      return;
    }
    const todays = sessions.find((s) => s.date === today);
    const past = [...sessions].reverse().find((s) => s.date <= today);
    setSessionId((todays ?? past ?? sessions[0]).id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions.length, schedule.id]);

  const studentName = (id: number) =>
    students.find((s) => s.id === id)?.full_name ?? `#${id}`;
  const selectedSession = sessions.find((s) => s.id === sessionId);

  if (sessions.length === 0) {
    return (
      <Card>
        <SectionHeading>Sesiones de clase</SectionHeading>
        <EmptyState
          icon="⊹"
          title="Aún no hay sesiones"
          message="Genera las sesiones del término para empezar a pasar lista y calificar."
          action={
            <Button
              disabled={generate.isPending}
              onClick={() =>
                generate.mutate(schedule.id, {
                  onError: onMutationError(
                    "No se pudieron generar (¿faltan fechas del curso?)",
                  ),
                })
              }
            >
              Generar sesiones del término
            </Button>
          }
        />
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <LocationPanel schedule={schedule} />

      <Card>
        <div className="mb-3 flex items-center justify-between gap-3">
          <SectionHeading className="mb-0">Sesión de clase</SectionHeading>
          <Select
            className="max-w-[16rem]"
            value={sessionId ?? 0}
            onChange={(e) => setSessionId(Number(e.target.value))}
          >
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.date}
                {s.date === today ? " · hoy" : ""}
                {s.status === "cancelled" ? " · cancelada" : ""}
                {s.origin_session_id ? " · recuperación" : ""}
              </option>
            ))}
          </Select>
        </div>
        {selectedSession && <SessionControls session={selectedSession} />}
        {sessionId != null && selectedSession?.status !== "cancelled" && (
          <SessionSheet
            sessionId={sessionId}
            enrollments={enrollments}
            studentName={studentName}
          />
        )}
      </Card>

      <div>
        <SectionHeading>Evaluaciones del curso (exámenes)</SectionHeading>
        <GradeTable enrollments={enrollments} students={students} />
      </div>
    </div>
  );
}

// Where this class is held, and a form to propose a change.
function LocationPanel({ schedule }: { schedule: Schedule }) {
  const { data: rooms = [] } = useRooms();
  const { data: proposals = [] } = useLocationProposals();
  const propose = useProposeLocation();

  const [modality, setModality] = useState<"presencial" | "virtual">(schedule.modality);
  const [joinUrl, setJoinUrl] = useState(schedule.join_url ?? "");
  const [roomId, setRoomId] = useState(schedule.room_id ?? 0);

  const pending = proposals.find(
    (p) => p.schedule_id === schedule.id && p.status === "pending",
  );
  const roomName = (id: number | null) =>
    id == null ? null : (rooms.find((r) => r.id === id)?.name ?? null);

  function submit() {
    propose.mutate(
      {
        scheduleId: schedule.id,
        modality,
        join_url: modality === "virtual" ? joinUrl : null,
        room_id: modality === "presencial" ? roomId || null : null,
      },
      {
        onSuccess: () => notify("Propuesta enviada para aprobación", "success"),
        onError: onMutationError("No se pudo enviar la propuesta"),
      },
    );
  }

  return (
    <Card>
      <SectionHeading>¿Dónde se da la clase?</SectionHeading>
      <div className="mb-3 flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
        {schedule.modality === "virtual" ? (
          schedule.join_url ? (
            <>
              <Badge color="indigo">Virtual</Badge>
              <span className="truncate text-slate-600">{schedule.join_url}</span>
              <span className="ml-auto text-xs font-semibold text-green-700">
                ✓ Aprobado
              </span>
            </>
          ) : (
            <>
              <Badge color="amber">Virtual</Badge>
              <span className="text-amber-700">Sin enlace aún</span>
            </>
          )
        ) : (
          <>
            <Badge color="slate">Presencial</Badge>
            <span className="text-slate-600">
              {roomName(schedule.room_id) ?? "sin aula"}
            </span>
          </>
        )}
      </div>

      {pending ? (
        <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Tienes una propuesta pendiente de aprobación (
          {pending.modality === "virtual" ? "virtual" : "presencial"}).
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex gap-2">
            {(["presencial", "virtual"] as const).map((m) => (
              <Button
                key={m}
                variant={modality === m ? "primary" : "secondary"}
                className="text-xs"
                onClick={() => setModality(m)}
              >
                {m === "virtual" ? "Virtual" : "Presencial"}
              </Button>
            ))}
          </div>
          {modality === "virtual" ? (
            <Input
              placeholder="https://meet.google.com/…  ó  Zoom / Teams"
              value={joinUrl}
              onChange={(e) => setJoinUrl(e.target.value)}
            />
          ) : (
            <Select value={roomId} onChange={(e) => setRoomId(Number(e.target.value))}>
              <option value={0}>Elige aula…</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                  {r.is_virtual ? " (virtual)" : ""}
                </option>
              ))}
            </Select>
          )}
          <Button
            disabled={
              propose.isPending || (modality === "virtual" ? !joinUrl.trim() : !roomId)
            }
            onClick={submit}
          >
            Proponer al administrador
          </Button>
        </div>
      )}
    </Card>
  );
}

// Cancel or reschedule the selected session — both in-product modals.
function SessionControls({ session }: { session: ClassSession }) {
  const cancel = useCancelSession();
  const reschedule = useRescheduleSession();
  const [newDate, setNewDate] = useState("");
  const [cancelling, setCancelling] = useState(false);

  if (session.status === "cancelled") {
    return (
      <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
        Clase cancelada{session.cancel_reason ? `: ${session.cancel_reason}` : "."}
      </div>
    );
  }

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-slate-100 pb-3">
      <Button
        variant="secondary"
        className="text-xs text-red-700"
        disabled={cancel.isPending}
        onClick={() => setCancelling(true)}
      >
        Cancelar clase
      </Button>
      <span className="ml-1 text-xs text-slate-400">Reprogramar a:</span>
      <input
        type="date"
        value={newDate}
        onChange={(e) => setNewDate(e.target.value)}
        className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs"
      />
      <Button
        variant="secondary"
        className="text-xs"
        disabled={!newDate || reschedule.isPending}
        onClick={() =>
          reschedule.mutate(
            { id: session.id, new_date: newDate },
            {
              onSuccess: () => {
                setNewDate("");
                notify("Clase reprogramada (recuperación creada)", "success");
              },
              onError: onMutationError("No se pudo reprogramar"),
            },
          )
        }
      >
        Reprogramar
      </Button>

      {cancelling && (
        <PromptModal
          title="Cancelar clase"
          label="Se avisará a los alumnos. Motivo (opcional):"
          placeholder="Ej. el profesor está enfermo"
          confirmLabel="Cancelar clase"
          confirmVariant="danger"
          multiline
          busy={cancel.isPending}
          onClose={() => setCancelling(false)}
          onSubmit={(reason) =>
            cancel.mutate(
              { id: session.id, reason: reason || undefined },
              {
                onSuccess: () => {
                  setCancelling(false);
                  notify("Clase cancelada", "success");
                },
                onError: (e) => {
                  setCancelling(false);
                  onMutationError("No se pudo cancelar")(e);
                },
              },
            )
          }
        />
      )}
    </div>
  );
}

// Attendance + the daily grade for one session, one card row per student.
function SessionSheet({
  sessionId,
  enrollments,
  studentName,
}: {
  sessionId: number;
  enrollments: Enrollment[];
  studentName: (id: number) => string;
}) {
  const { data: attendance = [] } = useVisibleAttendance();
  const { data: grades = [] } = useGrades();
  const markAll = useCreateAttendance();

  const markBySession = new Map(
    attendance
      .filter((a) => a.session_id === sessionId)
      .map((a) => [a.enrollment_id, a.status]),
  );
  const dailyGrade = (enrollmentId: number) =>
    grades.find(
      (g) =>
        g.enrollment_id === enrollmentId &&
        g.session_id === sessionId &&
        g.evaluation_name === DAILY_EVALUATION,
    );

  const marked = enrollments.filter((e) => markBySession.has(e.id)).length;

  function markEveryonePresent() {
    enrollments
      .filter((e) => !markBySession.has(e.id))
      .forEach((e) =>
        markAll.mutate({
          enrollment_id: e.id,
          session_id: sessionId,
          status: "present",
        }),
      );
  }

  if (enrollments.length === 0) {
    return (
      <EmptyState
        icon="◎"
        title="Sin alumnos matriculados"
        message="Cuando haya alumnos en este curso podrás pasar lista y poner la nota del día."
      />
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <Button
          variant="secondary"
          className="text-xs"
          disabled={markAll.isPending || marked === enrollments.length}
          onClick={markEveryonePresent}
        >
          Marcar todos presentes
        </Button>
        <span className="text-xs text-slate-400">
          {marked} / {enrollments.length} marcados
        </span>
      </div>
      <div className="space-y-2">
        {enrollments.map((e) => (
          <div
            key={e.id}
            className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 px-3 py-2.5"
          >
            <div className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">
              {initials(studentName(e.student_id))}
            </div>
            <div className="min-w-0 flex-1 text-sm font-medium text-slate-800">
              {studentName(e.student_id)}
            </div>
            <AttendanceMarks
              enrollmentId={e.id}
              sessionId={sessionId}
              current={markBySession.get(e.id)}
            />
            <DailyGradeInput
              enrollmentId={e.id}
              sessionId={sessionId}
              grade={dailyGrade(e.id)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

const MARK_LABELS = { present: "Presente", late: "Tarde", absent: "Ausente" } as const;
type MarkableStatus = keyof typeof MARK_LABELS;

function AttendanceMarks({
  enrollmentId,
  sessionId,
  current,
}: {
  enrollmentId: number;
  sessionId: number;
  current?: AttendanceStatus;
}) {
  const attendance = useCreateAttendance();

  return (
    <div className="flex gap-1">
      {(Object.keys(MARK_LABELS) as MarkableStatus[]).map((st) => {
        const selected = current === st;
        return (
          <Button
            key={st}
            variant={selected ? "primary" : "secondary"}
            aria-pressed={selected}
            className="px-2.5 py-1 text-xs"
            disabled={attendance.isPending}
            onClick={() =>
              attendance.mutate({
                enrollment_id: enrollmentId,
                session_id: sessionId,
                status: st,
              })
            }
          >
            {MARK_LABELS[st]}
          </Button>
        );
      })}
    </div>
  );
}

const SCORE_MIN = 0;
const SCORE_MAX = 10;

function DailyGradeInput({
  enrollmentId,
  sessionId,
  grade,
}: {
  enrollmentId: number;
  sessionId: number;
  grade?: Grade;
}) {
  const create = useCreateGrade();
  const [value, setValue] = useState(grade ? String(grade.score) : "");
  const [error, setError] = useState<string | null>(null);

  function commit() {
    const trimmed = value.trim();
    setError(null);
    if (trimmed === "") return;
    const score = Number(trimmed);
    if (Number.isNaN(score) || score < SCORE_MIN || score > SCORE_MAX) {
      setError(`0–${SCORE_MAX}`);
      return;
    }
    if (grade && score === grade.score) return;
    create.mutate(
      {
        enrollment_id: enrollmentId,
        evaluation_name: DAILY_EVALUATION,
        score,
        session_id: sessionId,
      },
      { onError: onMutationError("No se pudo guardar la nota") },
    );
  }

  return (
    <div>
      <Input
        className={`w-16 text-center font-mono ${error ? "border-red-400" : ""}`}
        inputMode="decimal"
        placeholder="—"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
      />
      {error && <p className="mt-0.5 text-xs text-red-600">{error}</p>}
    </div>
  );
}
