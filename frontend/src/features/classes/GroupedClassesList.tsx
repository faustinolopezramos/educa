import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { IconCheck, IconChevronDown, IconClock } from "../../components/icons";
import { Badge, Button, Card, EmptyState } from "../../components/ui";
import { holdsSeat } from "../../lib/enrollment";
import { dayName, formatTime, needsLink, shortDate, todayLocal } from "../../lib/format";
import {
  useCourses,
  useEnrollments,
  useEnsureSession,
  useMySessions,
  useSchedules,
  useVisibleAttendance,
} from "../../lib/queries";
import { notify } from "../../lib/toast";
import type { ClassSession, Schedule } from "../../lib/types";

export interface GroupedClassesListProps {
  selectedSchedule: Schedule | null;
  onSelectSchedule: (schedule: Schedule, sessionId?: number) => void;
}

/** How many upcoming classes to list before the rest is noise. */
const UPCOMING_SHOWN = 3;

/**
 * La agenda del profesor: hoy, lo que quedó sin cerrar, lo que viene.
 *
 * Antes eran tres bloques de tarjetas grandes, y en el móvil la pantalla medía
 * casi cuatro mil píxeles: cada lista sin cerrar de los últimos dos meses era
 * una tarjeta naranja parpadeando, con un «Entrar a Sala Virtual» para una clase
 * de julio y un «0/10 asistentes» cuyo 10 no salía de ningún sitio — estaba
 * escrito en el código. Ahora:
 *
 * - la clase de hoy es la única tarjeta grande, con los marcados sobre los
 *   alumnos que de verdad ocupan plaza;
 * - las listas de días anteriores son filas compactas, plegadas bajo su número;
 * - entrar al aula sólo se ofrece hoy, y sólo si la clase tiene parte en línea
 *   (una presencial no tiene aula virtual que abrir).
 */
export function GroupedClassesList({
  selectedSchedule,
  onSelectSchedule,
}: GroupedClassesListProps) {
  const { data: schedules = [], isLoading: loadingSchedules } = useSchedules(true);
  const { data: courses = [] } = useCourses();
  const { data: sessions = [] } = useMySessions();
  const { data: attendance = [] } = useVisibleAttendance();
  const { data: enrollments = [] } = useEnrollments();
  const ensure = useEnsureSession();
  const navigate = useNavigate();
  const [showOverdue, setShowOverdue] = useState(false);
  const [showAllUpcoming, setShowAllUpcoming] = useState(false);

  const today = todayLocal();
  const courseName = (id: number) => courses.find((c) => c.id === id)?.name ?? `#${id}`;

  // Alumnos con plaza por curso: el total real contra el que se cuenta la lista.
  const seatsByCourse = useMemo(() => {
    const map = new Map<number, number>();
    for (const e of enrollments) {
      if (holdsSeat(e.status)) map.set(e.course_id, (map.get(e.course_id) ?? 0) + 1);
    }
    return map;
  }, [enrollments]);

  const markedBySession = useMemo(() => {
    const map = new Map<number, number>();
    for (const a of attendance) map.set(a.session_id, (map.get(a.session_id) ?? 0) + 1);
    return map;
  }, [attendance]);

  const { todays, overdue, upcoming, history } = useMemo(() => {
    const scheduleMap = new Map(schedules.map((s) => [s.id, s]));
    const now: Array<{ session: ClassSession; schedule: Schedule }> = [];
    const late: Array<{ session: ClassSession; schedule: Schedule }> = [];
    const up: Array<{ session?: ClassSession; schedule: Schedule; date: string }> = [];
    const hist: Array<{ session: ClassSession; schedule: Schedule }> = [];

    for (const sess of sessions) {
      const sched = scheduleMap.get(sess.schedule_id);
      if (!sched) continue;
      if (sess.status === "cancelled" || sess.register_closed_at != null) {
        hist.push({ session: sess, schedule: sched });
      } else if (sess.date === today) {
        now.push({ session: sess, schedule: sched });
      } else if (sess.date < today || sess.status === "held") {
        late.push({ session: sess, schedule: sched });
      } else {
        up.push({ session: sess, schedule: sched, date: sess.date });
      }
    }

    for (const sched of schedules) {
      if (!sessions.some((s) => s.schedule_id === sched.id)) {
        up.push({ schedule: sched, date: dayName(sched.day_of_week) });
      }
    }

    now.sort((a, b) => a.schedule.start_time.localeCompare(b.schedule.start_time));
    late.sort((a, b) => b.session.date.localeCompare(a.session.date));
    up.sort((a, b) => a.date.localeCompare(b.date));
    hist.sort((a, b) => b.session.date.localeCompare(a.session.date));
    return { todays: now, overdue: late, upcoming: up, history: hist };
  }, [sessions, schedules, today]);

  function enterRoom(sched: Schedule) {
    ensure.mutate(
      { schedule_id: sched.id, date: today },
      {
        onSuccess: (session) => navigate(`/lobby/${session.id}`),
        onError: () => notify("No se pudo abrir el aula virtual", "error"),
      },
    );
  }

  const marksLabel = (session: ClassSession, schedule: Schedule) => {
    const marked = markedBySession.get(session.id) ?? 0;
    const total = seatsByCourse.get(schedule.course_id);
    return total != null ? `${marked} de ${total} marcados` : `${marked} marcados`;
  };

  if (loadingSchedules) {
    return (
      <Card>
        <div className="animate-pulse space-y-3 p-4">
          <div className="h-4 w-32 rounded bg-slate-200" />
          <div className="h-16 rounded-lg bg-slate-100" />
          <div className="h-16 rounded-lg bg-slate-100" />
        </div>
      </Card>
    );
  }

  if (schedules.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<IconClock className="h-5 w-5" />}
          title="Sin horarios asignados"
          message="Cuando la administración te asigne un curso, tus clases aparecerán aquí."
        />
      </Card>
    );
  }

  const shownUpcoming = showAllUpcoming ? upcoming : upcoming.slice(0, UPCOMING_SHOWN);

  return (
    <div className="space-y-6">
      {/* ---------------- Hoy ---------------- */}
      <section className="space-y-2.5">
        <GroupTitle>Hoy</GroupTitle>
        {todays.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-500">
            No tienes clases hoy.
          </p>
        ) : (
          todays.map(({ session, schedule }) => {
            const isSelected = selectedSchedule?.id === schedule.id;
            const marked = markedBySession.get(session.id) ?? 0;
            const total = seatsByCourse.get(schedule.course_id) ?? 0;
            const pct = total ? Math.round((marked / total) * 100) : 0;
            return (
              <div
                key={session.id}
                className={`rounded-xl border p-4 transition-colors ${
                  isSelected ? "border-brand-400 bg-brand-50/60" : "border-slate-200 bg-white"
                }`}
              >
                <p className="truncate text-sm font-bold text-slate-900">
                  {courseName(schedule.course_id)}
                </p>
                <p className="tabular text-xs text-slate-600">
                  {formatTime(schedule.start_time)}–{formatTime(schedule.end_time)}
                </p>
                <div className="mt-3 flex items-center gap-3">
                  <div
                    className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100"
                    role="progressbar"
                    aria-valuenow={marked}
                    aria-valuemin={0}
                    aria-valuemax={total}
                    aria-label="Alumnos marcados"
                  >
                    <div
                      className="h-full rounded-full bg-brand-500"
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                  <span className="tabular flex-none text-xs text-slate-600">
                    {marksLabel(session, schedule)}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => navigate(`/clase/${session.id}`)}>
                    Pasar lista
                  </Button>
                  {needsLink(schedule.modality) && (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={ensure.isPending}
                      onClick={() => enterRoom(schedule)}
                    >
                      Entrar al aula virtual
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onSelectSchedule(schedule, session.id)}
                  >
                    Ver detalle
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </section>

      {/* ---------------- Listas sin cerrar de días anteriores ---------------- */}
      {overdue.length > 0 && (
        <section>
          <button
            type="button"
            onClick={() => setShowOverdue((v) => !v)}
            aria-expanded={showOverdue}
            className="flex w-full items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-left"
          >
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-amber-900">
                {overdue.length === 1
                  ? "1 lista sin cerrar de días anteriores"
                  : `${overdue.length} listas sin cerrar de días anteriores`}
              </span>
              <span className="block text-xs text-amber-800">
                Ciérralas para que la asistencia de tus alumnos cuente.
              </span>
            </span>
            <IconChevronDown
              className={`h-4 w-4 flex-none text-amber-700 transition-transform ${
                showOverdue ? "rotate-180" : ""
              }`}
            />
          </button>
          {showOverdue && (
            <ul className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
              {overdue.map(({ session, schedule }) => (
                <li key={session.id}>
                  <button
                    type="button"
                    onClick={() => navigate(`/clase/${session.id}`)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-slate-900">
                        {shortDate(session.date)} · {formatTime(schedule.start_time)}
                      </span>
                      <span className="block truncate text-xs text-slate-500">
                        {courseName(schedule.course_id)} · {marksLabel(session, schedule)}
                      </span>
                    </span>
                    <span className="flex-none text-xs font-semibold text-brand-700">
                      Abrir lista
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* ---------------- Próximas ---------------- */}
      <section className="space-y-2.5">
        <GroupTitle>Próximas</GroupTitle>
        {upcoming.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-500">
            No hay próximas clases en tu agenda.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
            {shownUpcoming.map(({ session, schedule, date }, idx) => (
              <li key={session ? session.id : `up-${schedule.id}-${idx}`}>
                <button
                  type="button"
                  onClick={() => onSelectSchedule(schedule, session?.id)}
                  className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50 ${
                    selectedSchedule?.id === schedule.id ? "bg-brand-50/60" : ""
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-slate-900">
                      {session ? shortDate(date) : date} ·{" "}
                      <span className="tabular">{formatTime(schedule.start_time)}</span>
                    </span>
                    <span className="block truncate text-xs text-slate-500">
                      {courseName(schedule.course_id)}
                    </span>
                  </span>
                  <span className="flex-none text-xs font-semibold text-slate-500">
                    Ver detalle
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {upcoming.length > UPCOMING_SHOWN && (
          <Button
            size="sm"
            variant="ghost"
            className="w-full"
            onClick={() => setShowAllUpcoming((v) => !v)}
          >
            {showAllUpcoming ? "Ver menos" : `Ver las ${upcoming.length} próximas`}
          </Button>
        )}
      </section>

      {/* ---------------- Historial ---------------- */}
      {history.length > 0 && (
        <section className="space-y-2.5">
          <GroupTitle>Recientes</GroupTitle>
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
            {history.slice(0, 5).map(({ session, schedule }) => (
              <li key={session.id}>
                <button
                  type="button"
                  onClick={() => onSelectSchedule(schedule, session.id)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-slate-50"
                >
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold text-slate-800">
                      {shortDate(session.date)} · {formatTime(schedule.start_time)}
                    </span>
                    <span className="block truncate text-2xs text-slate-500">
                      {courseName(schedule.course_id)}
                    </span>
                  </span>
                  {session.status === "cancelled" ? (
                    <Badge color="red">Cancelada</Badge>
                  ) : (
                    <Badge color="green">
                      <IconCheck className="h-3 w-3" /> Cerrada
                    </Badge>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function GroupTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">{children}</h3>;
}
