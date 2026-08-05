import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
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
import {
  IconBook,
  IconCalendar,
  IconCheck,
  IconClock,
  IconLock,
  IconUsers,
} from "../components/icons";
import { GradeTable } from "../features/grades/GradeTable";
import { AssignmentsPanel } from "../features/assignments/AssignmentsPanel";
import { ProfilePanel } from "../features/profile/ProfilePanel";
import { ReportView } from "../features/reports/ReportView";
import { apiErrorDetail, apiErrorMessage } from "../lib/api";
import { SCORE_MAX, SCORE_MIN, DAILY_EVALUATION } from "../lib/constants";
import { absenceStreak, attendancePct, marksOf } from "../lib/attendance";
import { holdsSeat } from "../lib/enrollment";
import {
  MODALITY_LABELS,
  courseModality,
  courseModalityLabel,
  dayName,
  formatTime,
  modalityColor,
  modalityLabel,
  needsLink,
  todayLocal,
  usesRoom,
} from "../lib/format";
import { notify } from "../lib/toast";
import {
  useCancelSession,
  useCloseRegister,
  useCourseStudents,
  useCourses,
  useCreateAttendance,
  useCreateGrade,
  useEnrollments,
  useEnsureSession,
  useGenerateSessions,
  useGrades,
  useLanguages,
  useLevels,
  useLocationProposals,
  useProposeLocation,
  useReopenRegister,
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
  const { data: languages = [] } = useLanguages();
  const { data: levels = [] } = useLevels();
  const [selected, setSelected] = useState<Schedule | null>(null);

  const courseName = (id: number) => courses.find((c) => c.id === id)?.name ?? `#${id}`;

  const courseLanguageName = (id: number) => {
    const course = courses.find((c) => c.id === id);
    if (!course) return "";
    const level = levels.find((l) => l.id === course.level_id);
    if (!level) return "";
    const lang = languages.find((g) => g.id === level.language_id);
    return lang ? lang.name : "";
  };

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
                  <div className="mb-1.5 flex flex-wrap items-center justify-between gap-1.5">
                    <div className="min-w-0 flex items-center gap-1.5">
                      {courseLanguageName(courseId) && (
                        <Badge color="indigo">{courseLanguageName(courseId)}</Badge>
                      )}
                      <span className="truncate text-sm font-semibold text-slate-900">
                        {courseName(courseId)}
                      </span>
                    </div>
                    <div className="flex flex-none items-center gap-1.5">
                      {/* La modalidad del curso, no la de cada franja. Con dos
                          franjas iguales repetir la etiqueta en cada fila no
                          dice nada; cuando difieren, «mixta» es justo el aviso
                          que el profesor necesita antes de abrir una. */}
                      {(() => {
                        const cm = courseModality(slots);
                        return cm ? (
                          <Badge color={modalityColor(cm)}>
                            {courseModalityLabel(cm)}
                          </Badge>
                        ) : null;
                      })()}
                      {slots.length > 1 && (
                        <span className="text-2xs text-slate-400">
                          {slots.length} franjas
                        </span>
                      )}
                    </div>
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
  const { data: allEnrollments = [] } = useEnrollments(schedule.course_id);
  const { data: students = [] } = useCourseStudents(schedule.course_id);
  const { data: sessions = [] } = useSessions(schedule.id);
  const generate = useGenerateSessions();

  // `GET /enrollments` hands over the whole history of the course — quien
  // desistió, quien se certificó, quien está en pausa — mientras que el roster
  // de nombres (`useCourseStudents`) sólo devuelve a quien ocupa plaza. Cruzar
  // las dos listas sin filtrar ponía en la lista del día filas sin nombre
  // (`#42`) sobre las que la API rechaza la marca con un 409, e inflaba el
  // contador de alumnos con matrículas cerradas hace dos trimestres.
  const enrollments = useMemo(
    () => allEnrollments.filter((e) => holdsSeat(e.status)),
    [allEnrollments],
  );

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
                  {s.status === "cancelled"
                    ? " · cancelada"
                    : // Qué sesiones quedan por registrar, visible al elegirlas
                      // en lugar de descubrirse abriéndolas una por una.
                      s.register_closed_at
                      ? " · registrada"
                      : s.date <= today
                        ? " · sin registrar"
                        : ""}
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
                session={selectedSession}
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

  // Qué pide cada modalidad. Semi presencial pide las dos cosas: es una clase
  // que ocurre en el aula *y* en línea, y sin cualquiera de las dos mitades hay
  // alumnos que se quedan fuera. Antes el enlace sólo se enviaba en virtual, y
  // el backend además lo descartaba al guardarlo.
  const wantsRoom = usesRoom(modality);
  const wantsLink = needsLink(modality);
  const incomplete = (wantsRoom && !roomId) || (wantsLink && !joinUrl.trim());

  function submit() {
    propose.mutate(
      {
        scheduleId: schedule.id,
        modality,
        join_url: wantsLink ? joinUrl.trim() : null,
        room_id: wantsRoom ? roomId || null : null,
      },
      {
        onSuccess: () => notify("Propuesta enviada para aprobación", "success"),
        onError: onMutationError("No se pudo enviar la propuesta"),
      },
    );
  }

  return (
    <Card>
      <SectionHeading>Ubicación de la clase</SectionHeading>

      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-3 py-2.5 text-sm">
        <Badge color={modalityColor(schedule.modality)}>
          {modalityLabel(schedule.modality)}
        </Badge>
        {/* Las dos mitades, cada una con su estado. Una semi presencial mostraba
            sólo el aula, así que su enlace era invisible incluso cuando existía. */}
        {usesRoom(schedule.modality) && (
          <span className="text-slate-700">
            {roomName(schedule.room_id) ?? "Sin aula asignada"}
          </span>
        )}
        {needsLink(schedule.modality) &&
          (schedule.join_url ? (
            <>
              <span className="min-w-0 flex-1 truncate font-mono text-xs text-slate-600">
                {schedule.join_url}
              </span>
              <span className="flex-none text-xs font-semibold text-emerald-700">
                Aprobado
              </span>
            </>
          ) : (
            <span className="text-xs text-amber-800">Pendiente de enlace</span>
          ))}
      </div>

      {pending ? (
        <div className="mt-3">
          <InlineAlert type="warning">
            Ya enviaste una propuesta ({modalityLabel(pending.modality).toLowerCase()})
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
          {wantsRoom && (
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
          {wantsLink && (
            <Input
              className="max-w-xs"
              aria-label="Enlace de la videollamada"
              placeholder="https://meet.google.com/…"
              value={joinUrl}
              onChange={(e) => setJoinUrl(e.target.value)}
            />
          )}
          {/* Semi presencial exige aula y enlace, así que el botón espera a las
              dos. Antes sólo miraba una y la API rechazaba la propuesta. */}
          <Button disabled={propose.isPending || incomplete} onClick={submit}>
            {propose.isPending ? "Enviando…" : "Enviar propuesta"}
          </Button>
        </div>
      )}
      {!pending && modality === "semi_presencial" && (
        <p className="mt-2 text-2xs text-slate-500">
          Una clase semi presencial se da en el aula y en línea a la vez: necesita
          las dos cosas.
        </p>
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
  session,
  enrollments,
  studentName,
}: {
  session?: ClassSession;
  enrollments: Enrollment[];
  studentName: (id: number) => string;
}) {
  const sessionId = session?.id ?? 0;
  const sessionDate = session?.date;
  const { data: attendance = [] } = useVisibleAttendance();
  const { data: grades = [] } = useGrades();
  // Una sola mutación para las dos vías de marcar —el atajo de teclado y el
  // botón "todos presentes"—; el estado "marcando en lote" lo lleva `markingAll`
  // porque `isPending` sólo describe la última de las N peticiones en vuelo.
  const mark = useCreateAttendance();
  const [markingAll, setMarkingAll] = useState(false);
  const [focused, setFocused] = useState(0);

  // Al cambiar de sesión el foco vuelve arriba: seguir en la fila catorce de la
  // clase anterior no significa nada en la nueva.
  useEffect(() => setFocused(0), [sessionId]);

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

  // Una petición por alumno, pero un solo veredicto al final. Antes se
  // disparaban todas y se anunciaba el éxito en el mismo gesto, sin esperar a
  // ninguna: si la API rechazaba alguna, el profesor se quedaba con un "todos
  // marcados" que no era cierto y una fila sin marca que no explicaba nada.
  async function markEveryonePresent() {
    const pending = enrollments.filter((e) => !markBySession.has(e.id));
    if (pending.length === 0) return;

    setMarkingAll(true);
    const results = await Promise.allSettled(
      pending.map((e) =>
        mark.mutateAsync({
          enrollment_id: e.id,
          session_id: sessionId,
          status: "present",
        }),
      ),
    );
    setMarkingAll(false);

    const failed = results.filter((r) => r.status === "rejected");
    if (failed.length === 0) {
      notify("Todos marcados como presentes", "success");
      return;
    }
    const first = (failed[0] as PromiseRejectedResult).reason;
    notify(
      failed.length === results.length
        ? apiErrorMessage(first, "No se pudo pasar lista")
        : `${results.length - failed.length} de ${results.length} marcados; ${
            failed.length
          } fallaron: ${apiErrorMessage(first, "error desconocido")}`,
      "error",
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
  const closed = session?.register_closed_at != null;

  // El alumno enfocado por teclado. Pasar lista es una tarea de treinta
  // repeticiones idénticas: con el ratón son noventa clics y una búsqueda visual
  // por fila. Con ↑↓ para moverse y P/T/A/J para marcar, el profesor no levanta
  // la vista de la lista.
  function moveFocus(delta: number) {
    setFocused((current) => {
      const next = current + delta;
      if (next < 0) return 0;
      if (next > enrollments.length - 1) return enrollments.length - 1;
      return next;
    });
  }

  function onRosterKeyDown(event: ReactKeyboardEvent<HTMLUListElement>) {
    if (closed) return;
    const shortcut = MARK_SHORTCUTS[event.key.toLowerCase()];
    if (shortcut) {
      event.preventDefault();
      const target = enrollments[focused];
      if (!target) return;
      mark.mutate(
        { enrollment_id: target.id, session_id: sessionId, status: shortcut },
        { onError: onMutationError("No se pudo registrar la asistencia") },
      );
      // Avanzar solo: marcar y bajar es un gesto, no dos.
      moveFocus(1);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      moveFocus(event.key === "ArrowDown" ? 1 : -1);
    }
  }

  return (
    <div className="space-y-3">
      <RegisterBar
        marked={marked}
        total={enrollments.length}
        pct={pct}
        closed={closed}
        sessionId={sessionId}
        busy={markingAll}
        onMarkAll={markEveryonePresent}
      />

      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
      <ul
        tabIndex={closed ? -1 : 0}
        onKeyDown={onRosterKeyDown}
        aria-label="Lista de asistencia"
        className="divide-y divide-slate-100 rounded-lg border border-slate-200 outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
      >
        {enrollments.map((e, index) => (
          <RosterRow
            key={e.id}
            enrollment={e}
            name={studentName(e.student_id)}
            sessionId={sessionId}
            current={markBySession.get(e.id)}
            grade={dailyGrade(e.id)}
            history={marksOf(attendance, e.id)}
            focused={index === focused && !closed}
            locked={closed}
            onFocus={() => setFocused(index)}
          />
        ))}
      </ul>

      {!closed && (
        <p className="text-2xs text-slate-500">
          Con la lista enfocada: <Key>P</Key> presente, <Key>T</Key> tarde,{" "}
          <Key>A</Key> ausente, <Key>J</Key> justificada. <Key>↑</Key>
          <Key>↓</Key> para moverte.
        </p>
      )}
    </div>
  );
}

function Key({ children }: { children: ReactNode }) {
  return (
    <kbd className="mx-0.5 rounded border border-slate-300 bg-white px-1 font-sans text-2xs font-semibold text-slate-600">
      {children}
    </kbd>
  );
}

/**
 * La cabecera de la lista: cuánto llevas, y el cierre.
 *
 * Cerrar es lo que convierte una lista en una sesión registrada — antes bastaba
 * con marcar a uno, así que 3 de 30 figuraba en el reporte igual que 30 de 30.
 */
function RegisterBar({
  marked,
  total,
  pct,
  closed,
  sessionId,
  busy,
  onMarkAll,
}: {
  marked: number;
  total: number;
  pct: number;
  closed: boolean;
  sessionId: number;
  busy: boolean;
  onMarkAll: () => void;
}) {
  const close = useCloseRegister();
  const reopen = useReopenRegister();
  const complete = marked === total;

  function closeRegister(force: boolean) {
    close.mutate(
      { id: sessionId, force },
      {
        onSuccess: () => notify("Lista cerrada", "success"),
        onError: (error) => {
          const detail = apiErrorDetail(error);
          if (detail?.reason === "incomplete_register") {
            // La API dice cuántos faltan; preguntamos con ese número delante en
            // lugar de repetir el rechazo sin salida.
            const missing = Number(detail.total) - Number(detail.marked);
            if (
              window.confirm(
                `Faltan ${missing} de ${detail.total} alumnos por marcar. ` +
                  "¿Cerrar la lista de todos modos?",
              )
            ) {
              closeRegister(true);
            }
            return;
          }
          onMutationError("No se pudo cerrar la lista")(error);
        },
      },
    );
  }

  if (closed) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
        <span className="flex items-center gap-2 text-sm font-medium text-emerald-800">
          <IconCheck className="h-4 w-4" />
          Lista cerrada · {marked} de {total} registrados
        </span>
        <Button
          variant="secondary"
          size="sm"
          disabled={reopen.isPending}
          onClick={() =>
            reopen.mutate(sessionId, {
              onSuccess: () => notify("Lista reabierta para corregir", "success"),
              onError: onMutationError("No se pudo reabrir la lista"),
            })
          }
        >
          {reopen.isPending ? "Reabriendo…" : "Reabrir para corregir"}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" disabled={busy || complete} onClick={onMarkAll}>
          {busy ? "Marcando…" : "Marcar todos presentes"}
        </Button>
        <Button
          disabled={close.isPending || marked === 0}
          onClick={() => closeRegister(false)}
        >
          {close.isPending ? "Cerrando…" : "Cerrar lista"}
        </Button>
      </div>

      <div className="flex items-center gap-2.5">
        <span className="tabular text-xs font-medium text-slate-600">
          {marked} de {total}
        </span>
        <div
          className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-200"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Asistencia registrada"
        >
          <div
            className={`h-full transition-all ${complete ? "bg-emerald-600" : "bg-brand-500"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Una fila de la lista: quién es, cómo viene, cómo se le marca hoy.
 *
 * El contexto (tasa acumulada y racha de faltas) sale de las marcas que la
 * pantalla ya tenía cargadas. Sin él, el profesor marcaba a ciegas: la tercera
 * falta seguida de un alumno se veía igual que la primera.
 */
function RosterRow({
  enrollment,
  name,
  sessionId,
  current,
  grade,
  history,
  focused,
  locked,
  onFocus,
}: {
  enrollment: Enrollment;
  name: string;
  sessionId: number;
  current?: AttendanceStatus;
  grade?: Grade;
  history: { status: AttendanceStatus; order: number }[];
  focused: boolean;
  locked: boolean;
  onFocus: () => void;
}) {
  const row = useRef<HTMLLIElement>(null);
  const pct = attendancePct(history.map((h) => h.status));
  const streak = absenceStreak(history);

  // Mantener a la vista al alumno enfocado cuando se navega con el teclado en
  // una lista más larga que la pantalla.
  useEffect(() => {
    if (focused) row.current?.scrollIntoView({ block: "nearest" });
  }, [focused]);

  return (
    <li
      ref={row}
      onClick={onFocus}
      aria-current={focused ? "true" : undefined}
      className={`flex flex-wrap items-center justify-between gap-3 px-3 py-2.5 transition-colors ${
        focused ? "bg-brand-50 ring-1 ring-inset ring-brand-300" : ""
      }`}
    >
      <div className="flex min-w-[13rem] flex-1 items-center gap-2.5">
        <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
          {initials(name)}
        </span>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-slate-900">{name}</div>
          <div className="flex flex-wrap items-center gap-x-2 text-2xs text-slate-500">
            {pct != null ? (
              <span className={pct < 75 ? "font-semibold text-amber-700" : ""}>
                {pct}% asistencia
              </span>
            ) : (
              <span>Sin historial</span>
            )}
            {streak >= 2 && (
              <span className="font-semibold text-red-600">
                · {streak} faltas seguidas
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <AttendanceMarks
          enrollmentId={enrollment.id}
          sessionId={sessionId}
          current={current}
          disabled={locked}
        />

        <div className="flex items-center gap-2 border-l border-slate-200 pl-3">
          <span className="text-xs text-slate-500">Nota</span>
          <DailyGradeInput
            enrollmentId={enrollment.id}
            sessionId={sessionId}
            grade={grade}
            disabled={locked}
          />
        </div>
      </div>
    </li>
  );
}

// Los cuatro estados que el modelo admite. «Justificada» existía en la API desde
// el principio y la interfaz nunca la ofreció, así que una incapacidad médica
// sólo podía registrarse como ausencia — y penalizaba igual que no aparecer.
const MARK_LABELS = {
  present: "Presente",
  late: "Tarde",
  absent: "Ausente",
  excused: "Justificada",
} as const;
type MarkableStatus = keyof typeof MARK_LABELS;

/** La inicial de cada estado, que es también su atajo de teclado. */
const MARK_KEY: Record<MarkableStatus, string> = {
  present: "P",
  late: "T",
  absent: "A",
  excused: "J",
};

const MARK_SHORTCUTS: Record<string, MarkableStatus> = {
  p: "present",
  t: "late",
  a: "absent",
  j: "excused",
};

// Un color por estado, aplicado solo al botón elegido. Antes se construía con
// `!important` sobre el componente Button para forzar el fondo, lo que dejaba
// tres alturas de botón distintas conviviendo en la misma fila.
const MARK_SELECTED: Record<MarkableStatus, string> = {
  present: "bg-emerald-600 text-white",
  late: "bg-amber-500 text-white",
  absent: "bg-red-600 text-white",
  // Azul y no rojo a propósito: justificar no es penalizar, y el color es lo
  // primero que el profesor lee al repasar la columna.
  excused: "bg-sky-600 text-white",
};

function AttendanceMarks({
  enrollmentId,
  sessionId,
  current,
  disabled,
}: {
  enrollmentId: number;
  sessionId: number;
  current?: AttendanceStatus;
  disabled?: boolean;
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
            // El nombre completo va en el `title` y el `aria-label`; en pantalla
            // sólo la inicial, que es además el atajo. Cuatro etiquetas enteras
            // por fila empujaban la nota fuera de la vista en portátiles.
            title={`${MARK_LABELS[st]} (${MARK_KEY[st]})`}
            aria-label={MARK_LABELS[st]}
            disabled={disabled || attendance.isPending}
            onClick={() =>
              attendance.mutate(
                {
                  enrollment_id: enrollmentId,
                  session_id: sessionId,
                  status: st,
                },
                // Sin esto, un rechazo de la API (clase cancelada, matrícula
                // cerrada) revertía la marca optimista sin decir por qué: la
                // fila simplemente volvía a quedarse en blanco.
                { onError: onMutationError("No se pudo registrar la asistencia") },
              )
            }
            className={`tabular w-8 rounded-md py-1 text-xs font-bold transition-colors disabled:opacity-50 ${
              selected ? MARK_SELECTED[st] : "text-slate-500 hover:bg-white hover:text-slate-900"
            }`}
          >
            {MARK_KEY[st]}
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
  disabled,
}: {
  enrollmentId: number;
  sessionId: number;
  grade?: Grade;
  disabled?: boolean;
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
        placeholder={`/${SCORE_MAX}`}
        disabled={disabled}
        title={`Nota diaria, de ${SCORE_MIN} a ${SCORE_MAX}`}
        aria-label={`Nota diaria (${SCORE_MIN} a ${SCORE_MAX})`}
        aria-invalid={error ? true : undefined}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        // Enter guarda sin sacar la mano del teclado, que es como se rellena una
        // columna de treinta notas.
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
      />
      {error && <p className="mt-0.5 text-xs text-red-600">{error}</p>}
    </div>
  );
}
