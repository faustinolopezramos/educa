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
import { AssignmentsPanel } from "../features/assignments/AssignmentsPanel";
import { ProfilePanel } from "../features/profile/ProfilePanel";
import { ReportView } from "../features/reports/ReportView";
import { apiErrorMessage } from "../lib/api";
import { SCORE_MAX, SCORE_MIN, DAILY_EVALUATION } from "../lib/constants";
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
  Modality,
  Schedule,
} from "../lib/types";

const MODALITY_LABELS: Record<Modality, string> = {
  presencial: "Presencial",
  semi_presencial: "Semi presencial",
  virtual: "Virtual",
};

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

function localDow(d = new Date()): number {
  return (d.getDay() + 6) % 7;
}

function nowTimeString(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(
    now.getMinutes(),
  ).padStart(2, "0")}:00`;
}

interface FeaturedSchedule {
  s: Schedule;
  when: string;
  live: boolean;
}

// The class a teacher wants is almost never "the first one in the list" — it is
// the one happening right now, then the next one today, then whatever comes
// first this week. Both the highlight bar and the default selection use this,
// so opening the dashboard already lands on the right class.
function pickFeatured(schedules: Schedule[]): FeaturedSchedule | null {
  if (schedules.length === 0) return null;
  const today = localDow();
  const nowStr = nowTimeString();

  const todays = schedules
    .filter((s) => s.day_of_week === today)
    .sort((a, b) => a.start_time.localeCompare(b.start_time));

  const live = todays.find((s) => s.start_time <= nowStr && s.end_time >= nowStr);
  if (live) return { s: live, when: "ahora", live: true };

  const nextToday = todays.find((s) => s.start_time > nowStr);
  if (nextToday) return { s: nextToday, when: "hoy", live: false };

  const upcoming = [...schedules].sort((a, b) => {
    const da = (a.day_of_week - today + 7) % 7 || 7;
    const db = (b.day_of_week - today + 7) % 7 || 7;
    return da - db || a.start_time.localeCompare(b.start_time);
  })[0];
  return { s: upcoming, when: dayName(upcoming.day_of_week), live: false };
}

// Same ordering for the picker list: this week's classes in the order they
// actually happen, starting from today.
function sortByUpcoming(schedules: Schedule[]): Schedule[] {
  const today = localDow();
  return [...schedules].sort((a, b) => {
    const da = (a.day_of_week - today + 7) % 7;
    const db = (b.day_of_week - today + 7) % 7;
    return da - db || a.start_time.localeCompare(b.start_time);
  });
}

export default function TeacherDashboard() {
  const [params] = useSearchParams();
  const section = params.get("m") ?? "clases";

  if (section === "tareas") {
    return (
      <div>
        <PageTitle subtitle="Docencia">Tareas y Entregas</PageTitle>
        <AssignmentsPanel />
      </div>
    );
  }
  if (section === "reportes") {
    return (
      <div>
        <PageTitle subtitle="Solo tus cursos">Reporte de mis clases</PageTitle>
        <ReportView />
      </div>
    );
  }
  if (section === "perfil") {
    return (
      <div>
        <PageTitle subtitle="Cuenta">Mi perfil</PageTitle>
        <ProfilePanel />
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

  const featured = useMemo(() => pickFeatured(schedules), [schedules]);
  const orderedSchedules = useMemo(() => sortByUpcoming(schedules), [schedules]);
  const todayDow = localDow();

  // Land on the class that is happening now (or next), not on whichever one
  // the API happened to return first.
  useEffect(() => {
    if (!selected && featured) setSelected(featured.s);
  }, [featured, selected]);

  return (
    <div className="space-y-6">
      <PageTitle subtitle="Docencia">Mis clases y gestión académica</PageTitle>

      <NowBar
        featured={featured}
        courseName={courseName}
        onGo={(s) => setSelected(s)}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: Schedule Selector List */}
        <Card className="lg:col-span-1 space-y-4">
          <SectionHeading>Cursos asignados ({schedules.length})</SectionHeading>
          {schedules.length === 0 ? (
            <EmptyState
              icon="◷"
              title="Sin horarios asignados"
              message="Cuando la administración te asigne un curso y horario, tus clases aparecerán aquí."
            />
          ) : (
            <div className="space-y-2">
              {orderedSchedules.map((s) => {
                const isActive = selected?.id === s.id;
                const isToday = s.day_of_week === todayDow;
                return (
                  <button
                    key={s.id}
                    onClick={() => setSelected(s)}
                    className={`w-full rounded-xl border p-3.5 text-left transition-all ${
                      isActive
                        ? "border-brand-500 bg-brand-50/60 shadow-sm"
                        : "border-slate-200 hover:bg-slate-50 hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-semibold text-slate-900 text-sm">
                        {courseName(s.course_id)}
                      </div>
                      <Badge color={s.modality === "virtual" ? "indigo" : "slate"}>
                        {s.modality === "virtual" ? "Virtual" : "Presencial"}
                      </Badge>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2 text-xs font-mono text-slate-500">
                      <span>
                        📅 {isToday ? "Hoy" : dayName(s.day_of_week)}
                      </span>
                      <span>•</span>
                      <span>⏰ {formatTime(s.start_time)}–{formatTime(s.end_time)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </Card>

        {/* Right: Selected Class Management Workspace */}
        <div className="lg:col-span-2">
          {selected ? (
            <ClassDetail schedule={selected} courseName={courseName(selected.course_id)} />
          ) : (
            <Card className="py-16">
              <EmptyState
                icon="✎"
                title="Selecciona una clase"
                message="Elige un horario del panel izquierdo para gestionar la ubicación, pasar lista y calificar a tus alumnos."
              />
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function NowBar({
  featured,
  courseName,
  onGo,
}: {
  featured: FeaturedSchedule | null;
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

  if (!featured) return null;
  const { s, when, live } = featured;

  return (
    <div className="flex flex-wrap items-center gap-5 rounded-2xl bg-slate-900 px-6 py-4 text-slate-50 shadow-md">
      <div className="border-r border-slate-700 pr-5 text-center">
        <div className="font-mono text-[10px] uppercase tracking-wider text-slate-400">
          {live ? "En Vivo Ahora" : "Próxima Clase"}
        </div>
        <div className="font-mono text-2xl font-bold text-amber-400">
          {formatTime(s.start_time)}
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2.5">
          <h3 className="font-semibold text-lg text-white">{courseName(s.course_id)}</h3>
          {live && (
            <span className="rounded-full bg-emerald-500 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white animate-pulse">
              ● En curso
            </span>
          )}
        </div>
        <div className="mt-0.5 text-xs text-slate-400">
          {formatTime(s.start_time)}–{formatTime(s.end_time)} ·{" "}
          {s.modality === "virtual" ? "Virtual" : "Presencial"} ·{" "}
          {when === "ahora" ? "en curso" : `${when}`}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {(when === "ahora" || when === "hoy") && (
          <Button disabled={ensure.isPending} onClick={() => enterLobby(s)}>
            {ensure.isPending ? "Abriendo…" : "📹 Entrar al Lobby A/V"}
          </Button>
        )}
        <Button
          variant={when === "ahora" || when === "hoy" ? "secondary" : "primary"}
          onClick={() => onGo(s)}
        >
          Gestionar clase →
        </Button>
      </div>
    </div>
  );
}

function ClassDetail({ schedule, courseName }: { schedule: Schedule; courseName: string }) {
  const { data: enrollments = [] } = useEnrollments(schedule.course_id);
  const { data: students = [] } = useCourseStudents(schedule.course_id);
  const { data: sessions = [] } = useSessions(schedule.id);
  const generate = useGenerateSessions();

  const [sessionId, setSessionId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"attendance" | "exams">("attendance");

  const today = todayLocal();
  useEffect(() => {
    if (sessions.length === 0) {
      setSessionId(null);
      return;
    }
    const todays = sessions.find((s) => s.date === today);
    const past = [...sessions].reverse().find((s) => s.date <= today);
    setSessionId((todays ?? past ?? sessions[0]).id);
  }, [sessions.length, schedule.id]);

  const studentName = (id: number) =>
    students.find((s) => s.id === id)?.full_name ?? `#${id}`;
  const selectedSession = sessions.find((s) => s.id === sessionId);

  if (sessions.length === 0) {
    return (
      <Card className="py-12">
        <SectionHeading>{courseName}</SectionHeading>
        <EmptyState
          icon="⊹"
          title="Sesiones no generadas"
          message="Para empezar a pasar lista y registrar evaluaciones, genera las sesiones del trimestre."
          action={
            <Button
              disabled={generate.isPending}
              onClick={() =>
                generate.mutate(schedule.id, {
                  onError: onMutationError(
                    "No se pudieron generar las sesiones (verifica las fechas del curso)",
                  ),
                })
              }
            >
              Generar Sesiones del Trimestre
            </Button>
          }
        />
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Metrics Card */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
          <div className="text-xs font-medium text-slate-500">Alumnos Matriculados</div>
          <div className="mt-0.5 text-2xl font-semibold text-slate-900">{enrollments.length}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
          <div className="text-xs font-medium text-slate-500">Sesiones Totales</div>
          <div className="mt-0.5 text-2xl font-semibold text-slate-900">{sessions.length}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
          <div className="text-xs font-medium text-slate-500">Modalidad Actual</div>
          <div className="mt-0.5 text-sm font-semibold text-brand-600 capitalize">
            {schedule.modality === "virtual" ? "🌐 Virtual" : "🏫 Presencial"}
          </div>
        </div>
      </div>

      {/* Location Proposal Panel */}
      <LocationPanel schedule={schedule} />

      {/* Class Session Workspace Card */}
      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-3">
            <SectionHeading className="!mb-0">{courseName}</SectionHeading>
            <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
              <button
                onClick={() => setActiveTab("attendance")}
                className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                  activeTab === "attendance"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                📋 Lista y Diario
              </button>
              <button
                onClick={() => setActiveTab("exams")}
                className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                  activeTab === "exams"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                📊 Exámenes del Curso
              </button>
            </div>
          </div>

          {activeTab === "attendance" && (
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
          )}
        </div>

        {activeTab === "attendance" ? (
          <div>
            {selectedSession && <SessionControls session={selectedSession} />}
            {sessionId != null && selectedSession?.status !== "cancelled" && (
              <SessionSheet
                sessionId={sessionId}
                sessionDate={selectedSession?.date}
                enrollments={enrollments}
                studentName={studentName}
              />
            )}
          </div>
        ) : (
          <div className="pt-2">
            <GradeTable enrollments={enrollments} students={students} />
          </div>
        )}
      </Card>
    </div>
  );
}

function LocationPanel({ schedule }: { schedule: Schedule }) {
  const { data: rooms = [] } = useRooms();
  const { data: proposals = [] } = useLocationProposals();
  const propose = useProposeLocation();

  const [modality, setModality] = useState<Modality>(schedule.modality);
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
        room_id: modality !== "virtual" ? roomId || null : null,
      },
      {
        onSuccess: () => notify("Propuesta enviada para aprobación", "success"),
        onError: onMutationError("No se pudo enviar la propuesta"),
      },
    );
  }

  return (
    <Card className="space-y-3">
      <SectionHeading className="!mb-0">Ubicación y Enlace de Clase</SectionHeading>
      <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-3.5 py-2.5 text-xs">
        {schedule.modality === "virtual" ? (
          schedule.join_url ? (
            <>
              <Badge color="indigo">🌐 Virtual</Badge>
              <span className="truncate font-mono text-slate-700">{schedule.join_url}</span>
              <span className="ml-auto font-semibold text-emerald-700">✓ Aprobado</span>
            </>
          ) : (
            <>
              <Badge color="amber">🌐 Virtual</Badge>
              <span className="text-amber-800">Pendiente de enlace</span>
            </>
          )
        ) : (
          <>
            <Badge color="slate">
              🏫 {schedule.modality === "semi_presencial" ? "Semi presencial" : "Presencial"}
            </Badge>
            <span className="text-slate-700 font-medium">
              {roomName(schedule.room_id) ?? "Virtual"}
            </span>
          </>
        )}
      </div>

      {pending ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-3.5 py-2.5 text-xs text-amber-800 font-medium">
          ⌛ Tienes una propuesta pendiente de aprobación (
          {pending.modality === "virtual" ? "Virtual" : "Presencial"}).
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <div className="flex gap-1.5">
            {(["presencial", "semi_presencial", "virtual"] as const).map((m) => (
              <Button
                key={m}
                variant={modality === m ? "primary" : "secondary"}
                className="!py-1.5 !px-3 text-xs"
                onClick={() => setModality(m)}
              >
                {MODALITY_LABELS[m]}
              </Button>
            ))}
          </div>
          {modality === "virtual" ? (
            <Input
              className="max-w-xs text-xs"
              placeholder="https://meet.google.com/… o Zoom"
              value={joinUrl}
              onChange={(e) => setJoinUrl(e.target.value)}
            />
          ) : (
            <Select
              className="max-w-xs text-xs"
              value={roomId}
              onChange={(e) => setRoomId(Number(e.target.value))}
            >
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
            className="!py-1.5 text-xs"
          >
            Enviar Propuesta
          </Button>
        </div>
      )}
    </Card>
  );
}

function SessionControls({ session }: { session: ClassSession }) {
  const cancel = useCancelSession();
  const reschedule = useRescheduleSession();
  const [newDate, setNewDate] = useState("");
  const [cancelling, setCancelling] = useState(false);

  if (session.status === "cancelled") {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50/60 px-3.5 py-2 text-xs text-red-800 font-medium">
        🚫 Clase cancelada{session.cancel_reason ? `: ${session.cancel_reason}` : "."}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-slate-500">Reprogramar sesión a:</span>
        <Input
          type="date"
          value={newDate}
          onChange={(e) => setNewDate(e.target.value)}
          className="!py-1 text-xs max-w-[10rem]"
        />
        <Button
          variant="secondary"
          className="!py-1 text-xs"
          disabled={!newDate || reschedule.isPending}
          onClick={() =>
            reschedule.mutate(
              { id: session.id, new_date: newDate },
              {
                onSuccess: () => {
                  setNewDate("");
                  notify("Clase reprogramada (sesión de recuperación creada)", "success");
                },
                onError: onMutationError("No se pudo reprogramar"),
              },
            )
          }
        >
          Reprogramar
        </Button>
      </div>

      <Button
        variant="secondary"
        className="!py-1 text-xs text-red-700 border-red-200 hover:bg-red-50"
        disabled={cancel.isPending}
        onClick={() => setCancelling(true)}
      >
        Cancelar clase
      </Button>

      {cancelling && (
        <PromptModal
          title="Cancelar clase"
          label="Se notificará a los alumnos matriculados. Motivo (opcional):"
          placeholder="Ej. Incapacidad médica del profesor"
          confirmLabel="Confirmar cancelación"
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
                  notify("Clase cancelada correctamente", "success");
                },
                onError: (e) => {
                  setCancelling(false);
                  onMutationError("No se pudo cancelar la clase")(e);
                },
              },
            )
          }
        />
      )}
    </div>
  );
}

function SessionSheet({
  sessionId,
  sessionDate,
  enrollments,
  studentName,
}: {
  sessionId: number;
  sessionDate?: string;
  enrollments: Enrollment[];
  studentName: (id: number) => string;
}) {
  const { data: attendance = [] } = useVisibleAttendance();
  const { data: grades = [] } = useGrades();
  const markAll = useCreateAttendance();

  const today = todayLocal();
  const isFuture = sessionDate ? sessionDate > today : false;

  if (isFuture) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-6 text-center text-xs space-y-2 my-2">
        <div className="text-2xl">🔒</div>
        <h4 className="font-semibold text-amber-900 text-sm">Clase no iniciada (Fecha: {sessionDate})</h4>
        <p className="text-amber-800 max-w-md mx-auto">
          No es posible registrar la asistencia ni asignar notas diarias para clases futuras que aún no han iniciado. La toma de lista se habilitará automáticamente el día de la clase.
        </p>
      </div>
    );
  }

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
        message="Cuando se matriculen alumnos en este curso podrás tomar la asistencia y asignar la nota diaria."
      />
    );
  }

  return (
    <div className="space-y-4 pt-2">
      {/* Attendance Toolbar & Progress Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200/80 bg-emerald-50/50 p-4 shadow-2xs">
        <div className="flex items-center gap-3">
          <Button
            variant="primary"
            className="!py-2 !px-4 text-xs font-bold shadow-md shadow-brand-600/20 hover:scale-[1.02] active:scale-98 transition-all"
            disabled={markAll.isPending || marked === enrollments.length}
            onClick={() => {
              markEveryonePresent();
              notify("Asistencia completada para todos los alumnos en 1 clic", "success");
            }}
          >
            ✓ Marcar Todos Presentes (1 Clic)
          </Button>
          <span className="text-xs font-semibold text-slate-700">
            {marked} de {enrollments.length} registrados
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-emerald-700 font-mono">
            {Math.round((marked / enrollments.length) * 100)}%
          </span>
          <div className="w-28 h-2.5 rounded-full bg-slate-200 overflow-hidden">
            <div
              className="h-full bg-emerald-500 transition-all duration-300"
              style={{ width: `${(marked / enrollments.length) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Roster Cards */}
      <div className="space-y-2">
        {enrollments.map((e) => (
          <div
            key={e.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-2xs hover:border-slate-300 transition"
          >
            <div className="flex items-center gap-3 min-w-[14rem]">
              <div className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-800">
                {initials(studentName(e.student_id))}
              </div>
              <div className="font-semibold text-slate-900 text-sm">
                {studentName(e.student_id)}
              </div>
            </div>

            <div className="flex items-center gap-4">
              <AttendanceMarks
                enrollmentId={e.id}
                sessionId={sessionId}
                current={markBySession.get(e.id)}
              />

              <div className="flex items-center gap-1.5 border-l border-slate-100 pl-3">
                <span className="text-xs text-slate-500 font-medium">Nota diaria:</span>
                <DailyGradeInput
                  enrollmentId={e.id}
                  sessionId={sessionId}
                  grade={dailyGrade(e.id)}
                />
              </div>
            </div>
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
            variant={selected ? (st === "present" ? "primary" : st === "late" ? "secondary" : "secondary") : "secondary"}
            aria-pressed={selected}
            className={`!py-1 !px-2.5 text-xs transition ${
              selected
                ? st === "present"
                  ? "!bg-emerald-600 !text-white"
                  : st === "late"
                  ? "!bg-amber-500 !text-white"
                  : "!bg-red-600 !text-white"
                : "text-slate-600"
            }`}
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
        className={`w-16 text-center font-mono !py-1 text-xs ${error ? "border-red-400" : ""}`}
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
