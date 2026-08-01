import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { ActionTray } from "../components/ActionTray";
import { PromptModal } from "../components/PromptModal";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  InlineAlert,
  Input,
  PageHeader,
  SectionHeading,
  SegmentedControl,
  Select,
  Stat,
} from "../components/ui";
import { IconBook, IconCalendar, IconClock, IconLock, IconUsers } from "../components/icons";
import { GradeTable } from "../features/grades/GradeTable";
import { AssignmentsPanel } from "../features/assignments/AssignmentsPanel";
import { ProfilePanel } from "../features/profile/ProfilePanel";
import { ReportView } from "../features/reports/ReportView";
import { apiErrorMessage } from "../lib/api";
import { SCORE_MAX, SCORE_MIN, DAILY_EVALUATION } from "../lib/constants";
import {
  MODALITY_LABELS,
  dayName,
  formatTime,
  modalityColor,
  modalityLabel,
  todayLocal,
} from "../lib/format";
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

  // Cada panel dibuja su propia cabecera, así que aquí solo se enruta.
  if (section === "tareas") return <AssignmentsPanel />;
  if (section === "reportes") return <ReportView />;
  if (section === "perfil") return <ProfilePanel />;
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

  // A course with a Nocturna jornada is two weekly slots, so counting rows here
  // told a teacher they had twice the courses they teach. Group by course: the
  // heading counts courses, the rows stay the slots you actually stand up for.
  const byCourse = useMemo(() => {
    const groups = new Map<number, Schedule[]>();
    for (const s of orderedSchedules) {
      const list = groups.get(s.course_id) ?? [];
      list.push(s);
      groups.set(s.course_id, list);
    }
    return [...groups.entries()];
  }, [orderedSchedules]);

  return (
    <div>
      <PageHeader title="Mis clases" />

      {/* Classes whose register was never taken, and proposals still waiting on
          dirección. Both were invisible until a teacher went looking. */}
      <ActionTray emptyMessage="No tienes clases pendientes de registrar." />

      <NowBar featured={featured} courseName={courseName} onGo={(s) => setSelected(s)} />

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Left: Schedule Selector List */}
        <Card className="lg:col-span-1">
          <SectionHeading>
            {byCourse.length === 1 ? "1 curso asignado" : `${byCourse.length} cursos asignados`}
          </SectionHeading>
          {schedules.length === 0 ? (
            <EmptyState
              icon={<IconClock className="h-5 w-5" />}
              title="Sin horarios asignados"
              message="Cuando dirección te asigne un curso, tus clases aparecerán aquí."
            />
          ) : (
            <div className="space-y-4">
              {byCourse.map(([courseId, slots]) => (
                <div key={courseId}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-2">
                    <span className="min-w-0 truncate text-sm font-semibold text-slate-900">
                      {courseName(courseId)}
                    </span>
                    {slots.length > 1 && (
                      <span className="flex-none text-2xs text-slate-400">
                        {slots.length} franjas
                      </span>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    {slots.map((s) => {
                      const isActive = selected?.id === s.id;
                      const isToday = s.day_of_week === todayDow;
                      return (
                        <button
                          key={s.id}
                          onClick={() => setSelected(s)}
                          aria-current={isActive ? "true" : undefined}
                          className={`flex w-full items-center justify-between gap-2 rounded-lg border p-2.5 text-left transition-colors ${
                            isActive
                              ? "border-brand-500 bg-brand-50"
                              : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                          }`}
                        >
                          <span className="tabular min-w-0 truncate text-xs text-slate-600">
                            {isToday ? (
                              <span className="font-semibold text-brand-700">Hoy</span>
                            ) : (
                              dayName(s.day_of_week)
                            )}
                            {" · "}
                            {formatTime(s.start_time)}–{formatTime(s.end_time)}
                          </span>
                          <Badge color={modalityColor(s.modality)}>
                            {modalityLabel(s.modality)}
                          </Badge>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Right: Selected Class Management Workspace */}
        <div className="lg:col-span-2">
          {selected ? (
            <ClassDetail schedule={selected} courseName={courseName(selected.course_id)} />
          ) : (
            <Card>
              <EmptyState
                icon={<IconBook className="h-5 w-5" />}
                title="Selecciona una clase"
                message="Elige un horario de la izquierda para pasar lista, calificar y fijar la ubicación."
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
  const todayOrNow = when === "ahora" || when === "hoy";

  return (
    <div className="mb-5 flex flex-wrap items-center gap-x-5 gap-y-3 rounded-xl bg-slate-900 px-5 py-4 text-slate-100">
      <div className="flex-none border-r border-slate-700 pr-5">
        <div className="text-2xs font-semibold uppercase tracking-wider text-slate-400">
          {live ? "En curso" : "Próxima clase"}
        </div>
        <div className="tabular text-2xl font-bold text-white">{formatTime(s.start_time)}</div>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h2 className="truncate text-base font-semibold text-white">
            {courseName(s.course_id)}
          </h2>
          {live && (
            <span className="flex-none rounded-md bg-emerald-500 px-1.5 py-0.5 text-2xs font-bold uppercase tracking-wide text-white">
              En vivo
            </span>
          )}
        </div>
        <div className="tabular mt-0.5 text-xs text-slate-400">
          {formatTime(s.start_time)}–{formatTime(s.end_time)} ·{" "}
          {modalityLabel(s.modality)}
          {!todayOrNow && ` · ${when}`}
        </div>
      </div>

      <div className="flex flex-none flex-wrap items-center gap-2">
        {todayOrNow && (
          <Button disabled={ensure.isPending} onClick={() => enterLobby(s)}>
            {ensure.isPending ? "Abriendo…" : "Entrar al aula"}
          </Button>
        )}
        <Button variant={todayOrNow ? "secondary" : "primary"} onClick={() => onGo(s)}>
          Gestionar clase
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
      <Card>
        <SectionHeading>{courseName}</SectionHeading>
        <EmptyState
          icon={<IconCalendar className="h-5 w-5" />}
          title="Todavía no hay sesiones"
          message="Genera las sesiones del periodo para poder pasar lista y registrar notas."
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
              {generate.isPending ? "Generando…" : "Generar sesiones"}
            </Button>
          }
        />
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Alumnos" value={enrollments.length} />
        <Stat label="Sesiones" value={sessions.length} />
        <Stat
          label="Modalidad"
          value={
            <span className="text-lg">{modalityLabel(schedule.modality)}</span>
          }
        />
      </div>

      <LocationPanel schedule={schedule} />

      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex min-w-0 items-center gap-3">
            <SectionHeading className="!mb-0 truncate">{courseName}</SectionHeading>
            <SegmentedControl
              value={activeTab}
              onChange={setActiveTab}
              options={[
                { value: "attendance" as const, label: "Lista del día" },
                { value: "exams" as const, label: "Exámenes" },
              ]}
            />
          </div>

          {activeTab === "attendance" && (
            <Select
              aria-label="Sesión"
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

  const currentLabel =
    schedule.modality === "virtual"
      ? "Virtual"
      : schedule.modality === "semi_presencial"
        ? "Semi presencial"
        : "Presencial";

  return (
    <Card>
      <SectionHeading>Ubicación de la clase</SectionHeading>

      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-3 py-2.5 text-sm">
        <Badge color={schedule.modality === "virtual" ? "indigo" : "slate"}>
          {currentLabel}
        </Badge>
        {schedule.modality === "virtual" ? (
          schedule.join_url ? (
            <>
              <span className="min-w-0 flex-1 truncate font-mono text-xs text-slate-600">
                {schedule.join_url}
              </span>
              <span className="flex-none text-xs font-semibold text-emerald-700">Aprobado</span>
            </>
          ) : (
            <span className="text-xs text-amber-800">Pendiente de enlace</span>
          )
        ) : (
          <span className="text-slate-700">{roomName(schedule.room_id) ?? "Sin aula asignada"}</span>
        )}
      </div>

      {pending ? (
        <div className="mt-3">
          <InlineAlert type="warning">
            Ya enviaste una propuesta ({pending.modality === "virtual" ? "virtual" : "presencial"})
            y está esperando aprobación de dirección.
          </InlineAlert>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-end gap-2.5">
          <SegmentedControl
            value={modality}
            onChange={setModality}
            options={(["presencial", "semi_presencial", "virtual"] as const).map((m) => ({
              value: m,
              label: MODALITY_LABELS[m],
            }))}
          />
          {modality === "virtual" ? (
            <Input
              className="max-w-xs"
              aria-label="Enlace de la videollamada"
              placeholder="https://meet.google.com/…"
              value={joinUrl}
              onChange={(e) => setJoinUrl(e.target.value)}
            />
          ) : (
            <Select
              className="max-w-xs"
              aria-label="Aula"
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
            disabled={propose.isPending || (modality === "virtual" ? !joinUrl.trim() : !roomId)}
            onClick={submit}
          >
            {propose.isPending ? "Enviando…" : "Enviar propuesta"}
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
      <InlineAlert type="error" title="Clase cancelada">
        {session.cancel_reason || "No se indicó motivo."}
      </InlineAlert>
    );
  }

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
      <div className="flex items-center gap-2">
        <label htmlFor="reschedule-date" className="text-xs font-medium text-slate-600">
          Reprogramar a
        </label>
        <Input
          id="reschedule-date"
          type="date"
          value={newDate}
          onChange={(e) => setNewDate(e.target.value)}
          className="max-w-[10rem]"
        />
        <Button
          variant="secondary"
          size="sm"
          disabled={!newDate || reschedule.isPending}
          onClick={() =>
            reschedule.mutate(
              { id: session.id, new_date: newDate },
              {
                onSuccess: () => {
                  setNewDate("");
                  notify("Clase reprogramada: se creó una sesión de recuperación", "success");
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
        size="sm"
        className="border-red-200 text-red-700 hover:bg-red-50"
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
      <EmptyState
        icon={<IconLock className="h-5 w-5" />}
        title={`La clase del ${sessionDate} aún no empieza`}
        message="La lista y las notas diarias se habilitan el mismo día de la clase."
      />
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
        icon={<IconUsers className="h-5 w-5" />}
        title="Sin alumnos matriculados"
        message="Cuando se matriculen alumnos podrás pasar lista y poner la nota diaria."
      />
    );
  }

  const pct = Math.round((marked / enrollments.length) * 100);

  return (
    <div className="space-y-3">
      {/* Barra de progreso de la toma de lista.
          El botón dice lo que hace y nada más: antes se llamaba
          "✓ Marcar Todos Presentes (1 Clic)", donde "(1 Clic)" describía el
          esfuerzo de usarlo, no su efecto. */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <Button
          disabled={markAll.isPending || marked === enrollments.length}
          onClick={() => {
            markEveryonePresent();
            notify("Todos marcados como presentes", "success");
          }}
        >
          Marcar todos presentes
        </Button>

        <div className="flex items-center gap-2.5">
          <span className="tabular text-xs text-slate-600">
            {marked} de {enrollments.length}
          </span>
          <div
            className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-200"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Asistencia registrada"
          >
            <div className="h-full bg-emerald-600" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>

      {/* Roster */}
      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
        {enrollments.map((e) => (
          <li
            key={e.id}
            className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5"
          >
            <div className="flex min-w-[12rem] items-center gap-2.5">
              <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                {initials(studentName(e.student_id))}
              </span>
              <span className="text-sm font-medium text-slate-900">
                {studentName(e.student_id)}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <AttendanceMarks
                enrollmentId={e.id}
                sessionId={sessionId}
                current={markBySession.get(e.id)}
              />

              <div className="flex items-center gap-2 border-l border-slate-200 pl-3">
                <span className="text-xs text-slate-500">Nota</span>
                <DailyGradeInput
                  enrollmentId={e.id}
                  sessionId={sessionId}
                  grade={dailyGrade(e.id)}
                />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

const MARK_LABELS = { present: "Presente", late: "Tarde", absent: "Ausente" } as const;
type MarkableStatus = keyof typeof MARK_LABELS;

// Un color por estado, aplicado solo al botón elegido. Antes se construía con
// `!important` sobre el componente Button para forzar el fondo, lo que dejaba
// tres alturas de botón distintas conviviendo en la misma fila.
const MARK_SELECTED: Record<MarkableStatus, string> = {
  present: "bg-emerald-600 text-white",
  late: "bg-amber-500 text-white",
  absent: "bg-red-600 text-white",
};

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
    <div role="group" aria-label="Asistencia" className="flex rounded-lg bg-slate-100 p-0.5">
      {(Object.keys(MARK_LABELS) as MarkableStatus[]).map((st) => {
        const selected = current === st;
        return (
          <button
            key={st}
            type="button"
            aria-pressed={selected}
            disabled={attendance.isPending}
            onClick={() =>
              attendance.mutate({
                enrollment_id: enrollmentId,
                session_id: sessionId,
                status: st,
              })
            }
            className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors disabled:opacity-50 ${
              selected ? MARK_SELECTED[st] : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {MARK_LABELS[st]}
          </button>
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
        className={`tabular w-14 px-2 text-center ${error ? "border-red-400" : ""}`}
        inputMode="decimal"
        placeholder="—"
        aria-label={`Nota diaria (0 a ${SCORE_MAX})`}
        aria-invalid={error ? true : undefined}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
      />
      {error && <p className="mt-0.5 text-xs text-red-600">{error}</p>}
    </div>
  );
}
