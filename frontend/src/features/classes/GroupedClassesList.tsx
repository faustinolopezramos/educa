import { useMemo } from "react";
import { useNavigate } from "react-router-dom";

import { IconCheck, IconClock } from "../../components/icons";
import { Badge, Button, Card, EmptyState } from "../../components/ui";
import { dayName, formatTime, todayLocal } from "../../lib/format";
import {
  useCourses,
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

export function GroupedClassesList({
  selectedSchedule,
  onSelectSchedule,
}: GroupedClassesListProps) {
  const { data: schedules = [], isLoading: loadingSchedules } = useSchedules(true);
  const { data: courses = [] } = useCourses();
  const { data: sessions = [] } = useMySessions();
  const { data: attendance = [] } = useVisibleAttendance();
  const ensure = useEnsureSession();
  const navigate = useNavigate();

  const today = todayLocal();
  const courseName = (id: number) => courses.find((c) => c.id === id)?.name ?? `#${id}`;

  // Map schedule_id -> Schedule
  const scheduleMap = useMemo(() => {
    const map = new Map<number, Schedule>();
    for (const s of schedules) {
      map.set(s.id, s);
    }
    return map;
  }, [schedules]);

  // Group sessions by 3 visual statuses:
  // 1. "En Curso / Acción Requerida" (Estado: En vivo / Lista Abierta)
  // 2. "Próximas Clases" (Estado: Programada)
  // 3. "Historial Reciente" (Estado: Cerrada / Cancelada)
  const { activeOrOpen, upcoming, history } = useMemo(() => {
    const active: Array<{ session: ClassSession; schedule: Schedule }> = [];
    const up: Array<{ session?: ClassSession; schedule: Schedule; date: string }> = [];
    const hist: Array<{ session: ClassSession; schedule: Schedule }> = [];

    // Process materialized sessions
    for (const sess of sessions) {
      const sched = scheduleMap.get(sess.schedule_id);
      if (!sched) continue;

      if (sess.status === "cancelled") {
        hist.push({ session: sess, schedule: sched });
      } else if (sess.register_closed_at != null) {
        hist.push({ session: sess, schedule: sched });
      } else if (sess.date <= today || sess.status === "held") {
        active.push({ session: sess, schedule: sched });
      } else {
        up.push({ session: sess, schedule: sched, date: sess.date });
      }
    }

    for (const sched of schedules) {
      const hasSession = sessions.some((s) => s.schedule_id === sched.id);
      if (!hasSession) {
        up.push({ schedule: sched, date: dayName(sched.day_of_week) });
      }
    }

    // Sort active: today first
    active.sort((a, b) => b.session.date.localeCompare(a.session.date));
    // Sort upcoming: closest dates first
    up.sort((a, b) => a.date.localeCompare(b.date));
    // Sort history: most recent first
    hist.sort((a, b) => b.session.date.localeCompare(a.session.date));

    return { activeOrOpen: active, upcoming: up, history: hist };
  }, [sessions, schedules, scheduleMap, today]);

  function handleEnterLobby(sched: Schedule, dateStr: string) {
    const targetDate = dateStr.includes("-") ? dateStr : today;
    ensure.mutate(
      { schedule_id: sched.id, date: targetDate },
      {
        onSuccess: (session) => navigate(`/lobby/${session.id}`),
        onError: () => notify("No se pudo acceder al lobby", "error"),
      },
    );
  }

  // Attendance count per session helper
  function sessionAttendanceCount(sessionId: number) {
    return attendance.filter((a) => a.session_id === sessionId).length;
  }

  if (loadingSchedules) {
    return (
      <Card>
        <div className="animate-pulse space-y-3 p-4">
          <div className="h-4 w-32 bg-slate-200 rounded" />
          <div className="h-16 bg-slate-100 rounded-lg" />
          <div className="h-16 bg-slate-100 rounded-lg" />
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
          message="Cuando la administración te asigne un curso, tus clases agrupadas aparecerán aquí."
        />
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* ---------------- SECTION 1: En Curso / Acción Requerida ---------------- */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-amber-900 dark:text-amber-300 flex items-center gap-2">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
            </span>
            En Curso / Acción Requerida ({activeOrOpen.length})
          </h3>
        </div>

        {activeOrOpen.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400">
            No tienes listas de asistencia abiertas pendientes de cerrar.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {activeOrOpen.map(({ session, schedule }) => {
              const isSelected = selectedSchedule?.id === schedule.id;
              const markedCount = sessionAttendanceCount(session.id);
              const totalEst = Math.max(markedCount, 10);
              const pct = Math.round((markedCount / totalEst) * 100);

              return (
                <div
                  key={session.id}
                  onClick={() => onSelectSchedule(schedule, session.id)}
                  className={`group cursor-pointer rounded-xl border-2 p-4 transition-all ${
                    isSelected
                      ? "border-amber-500 bg-amber-50/80 shadow-md ring-2 ring-amber-400/20"
                      : "border-amber-300 bg-amber-50/30 hover:border-amber-400 hover:bg-amber-50/60 hover:shadow-sm"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <span className="text-2xs font-bold text-amber-800 uppercase tracking-wider">
                        {courseName(schedule.course_id)}
                      </span>
                      <h4 className="text-sm font-bold text-slate-900 mt-0.5">
                        {session.date === today ? "Hoy" : session.date} ·{" "}
                        {formatTime(schedule.start_time)} – {formatTime(schedule.end_time)}
                      </h4>
                    </div>
                    {/* Badge Parpadeante Naranja */}
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-2xs font-bold text-amber-800 animate-pulse border border-amber-300">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-500"></span>
                      Lista Abierta
                    </span>
                  </div>

                  {/* Barra de progreso de asistencia */}
                  <div className="mt-3 space-y-1">
                    <div className="flex items-center justify-between text-2xs font-medium text-slate-600">
                      <span>Progreso de asistencia</span>
                      <span className="font-semibold text-slate-900">
                        {markedCount}/{totalEst} asistentes ({pct}%)
                      </span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-amber-500 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-end gap-2">
                    <Button
                      size="sm"
                      variant="primary"
                      disabled={ensure.isPending}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEnterLobby(schedule, session.date);
                      }}
                    >
                      🎥 Entrar a Sala Virtual
                    </Button>
                    <Button size="sm" variant={isSelected ? "primary" : "secondary"}>
                      Pasar Lista / Gestionar
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ---------------- SECTION 2: Próximas Clases (Programadas) ---------------- */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-blue-900 dark:text-blue-300 flex items-center gap-2">
            <IconClock className="h-3.5 w-3.5 text-blue-600" />
            Próximas Clases ({upcoming.length})
          </h3>
        </div>

        {upcoming.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400">
            No hay próximas clases programadas en tu agenda.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {upcoming.map(({ session, schedule, date }, idx) => {
              const isSelected = selectedSchedule?.id === schedule.id;

              return (
                <div
                  key={session ? session.id : `up-${schedule.id}-${idx}`}
                  className={`rounded-xl border p-4 transition-all ${
                    isSelected
                      ? "border-blue-500 bg-blue-50/80 shadow-md ring-2 ring-blue-400/20"
                      : "border-blue-200 bg-blue-50/20 hover:border-blue-300 hover:bg-blue-50/40"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <span className="text-2xs font-semibold text-blue-700 uppercase tracking-wider">
                        {courseName(schedule.course_id)}
                      </span>
                      <h4 className="text-sm font-bold text-slate-900 mt-0.5">
                        {date} ·{" "}
                        <span className="text-blue-800 font-extrabold tabular">
                          {formatTime(schedule.start_time)}
                        </span>{" "}
                        – {formatTime(schedule.end_time)}
                      </h4>
                    </div>
                    {/* Badge Azul Programada */}
                    <Badge color="indigo">Programada</Badge>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                    <Button
                      size="sm"
                      variant="primary"
                      disabled={ensure.isPending}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEnterLobby(schedule, date);
                      }}
                    >
                      Entrar al Lobby
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => onSelectSchedule(schedule, session?.id)}
                    >
                      Ver Detalle
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ---------------- SECTION 3: Historial Reciente (Cerradas / Canceladas) ---------------- */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
            <IconCheck className="h-3.5 w-3.5 text-slate-400" />
            Historial Reciente ({history.length})
          </h3>
        </div>

        {history.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400">
            No hay clases registradas en tu historial reciente.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {history.slice(0, 6).map(({ session, schedule }) => {
              const isSelected = selectedSchedule?.id === schedule.id;
              const isCancelled = session.status === "cancelled";

              return (
                <div
                  key={session.id}
                  onClick={() => onSelectSchedule(schedule, session.id)}
                  className={`cursor-pointer rounded-xl border p-3.5 opacity-80 hover:opacity-100 transition-all ${
                    isSelected
                      ? "border-slate-400 bg-slate-100/90 shadow-sm"
                      : "border-slate-200 bg-slate-50/60 hover:border-slate-300 hover:bg-slate-100/50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-2xs font-medium text-slate-500 truncate">
                        {courseName(schedule.course_id)}
                      </p>
                      <p className="text-xs font-semibold text-slate-800">
                        {session.date} · {formatTime(schedule.start_time)}–
                        {formatTime(schedule.end_time)}
                      </p>
                    </div>

                    {/* Semantic Badges: Verde = Cerrada, Rojo = Cancelada */}
                    {isCancelled ? (
                      <Badge color="red">Cancelada</Badge>
                    ) : (
                      <Badge color="green">Cerrada</Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
