import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";

import { useAuth } from "../../auth/AuthContext";
import { ActionTray } from "../../components/ActionTray";
import { AcademyKpis } from "./AcademyKpis";
import { FirstSteps } from "./FirstSteps";
import { Badge, Button, Card, PageHeader, SectionHeading } from "../../components/ui";
import { adminStatusLine } from "../../lib/adminHome";
import {
  DAYS,
  dayName,
  formatTime,
  localDow,
  modalityColor,
  modalityLabel,
} from "../../lib/format";
import { useCourses, useDashboard, useRooms, useSchedules } from "../../lib/queries";
import { canSeeSection } from "../../lib/nav";

/**
 * The academy's home screen, for an admin or an assistant.
 *
 * It used to open with three counts — students, classes this week, attendance
 * rate — and one alert about location proposals. The counts were true and
 * inert: you could read all three and still not know that five matrículas had
 * fallen into arrears, that eight of last month's classes were never
 * registered, or that a course was one seat from full.
 *
 * Everything actionable now arrives through `ActionTray`, which the API fills
 * per role *and per permission* — so the proposals alert this file used to own
 * is one row among several, and an assistant is never shown a queue they have
 * no permission to work.
 *
 * The full weekly timetable (drag-and-drop) used to be embedded at the bottom
 * of this screen — the heaviest workspace an admin has, buried under KPIs and
 * pendientes, with no menu entry of its own. It now lives in "Horarios"; this
 * screen only shows a compact preview that links there.
 */
export function InicioPanel() {
  const { user } = useAuth();
  const [, setParams] = useSearchParams();
  const { data: dashboard } = useDashboard();

  const firstName = user?.full_name?.split(" ")[0] ?? "";
  const setupPending = Boolean(dashboard?.setup?.some((step) => !step.done));
  const canEnroll = canSeeSection(user, "enrollments");
  const canSeeCourses = canSeeSection(user, "courses");
  const canSeeHorarios = canSeeSection(user, "horarios");

  return (
    <div>
      <PageHeader
        title={firstName ? `Hola, ${firstName}` : "Resumen"}
        description={
          setupPending
            ? "Tu academia aún se está montando. Sigue los pasos de abajo."
            : adminStatusLine(dashboard?.items ?? [])
        }
        actions={
          setupPending ? undefined : (
            <>
              {canSeeCourses && (
                <Button variant="secondary" onClick={() => setParams({ m: "courses" })}>
                  Cursos
                </Button>
              )}
              {canEnroll && (
                <Button onClick={() => setParams({ m: "enrollments" })}>Nueva matrícula</Button>
              )}
            </>
          )
        }
      />

      {/* Una academia a medio montar ve primero cómo terminar de montarla; sus
          KPI a cero y un «todo al día» no le dicen nada. */}
      {setupPending && <FirstSteps steps={dashboard!.setup!} />}

      {!setupPending && <AcademyKpis />}

      {!(setupPending && (dashboard?.items.length ?? 0) === 0) && (
        <ActionTray emptyMessage="No hay nada pendiente en la academia. Todo al día." />
      )}

      {canSeeHorarios && !setupPending && <WeekPreview />}
    </div>
  );
}

/**
 * Las próximas clases de la semana, en una lista compacta que enlaza al
 * horario completo — no un calendario entero embebido aquí.
 */
function WeekPreview() {
  const [, setParams] = useSearchParams();
  const { data: schedules = [] } = useSchedules();
  const { data: courses = [] } = useCourses();
  const { data: rooms = [] } = useRooms();

  const courseName = (id: number) => courses.find((c) => c.id === id)?.name ?? `#${id}`;
  const roomName = (id: number | null) =>
    id == null ? null : (rooms.find((r) => r.id === id)?.name ?? null);

  const today = localDow();
  const upcoming = useMemo(() => {
    return [...schedules]
      .sort((a, b) => {
        // Los días se ordenan en rueda a partir de hoy: el lunes que viene se
        // ve más lejos que el sábado de esta semana, igual que en el
        // calendario real.
        const da = (a.day_of_week - today + 7) % 7;
        const db = (b.day_of_week - today + 7) % 7;
        return da - db || a.start_time.localeCompare(b.start_time);
      })
      .slice(0, 6);
  }, [schedules, today]);

  return (
    <Card padding="sm">
      <div className="mb-3 flex items-center justify-between">
        <SectionHeading>Esta semana</SectionHeading>
        <Button variant="secondary" size="sm" onClick={() => setParams({ m: "horarios" })}>
          Ver horarios completos →
        </Button>
      </div>

      {upcoming.length === 0 ? (
        <p className="py-6 text-center text-xs text-slate-500">Todavía no hay horarios armados.</p>
      ) : (
        <div className="space-y-1.5">
          {upcoming.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2 text-xs"
            >
              <span className="tabular w-24 flex-none font-semibold text-slate-600">
                {DAYS[s.day_of_week]?.slice(0, 3) ?? dayName(s.day_of_week)}{" "}
                {formatTime(s.start_time)}
              </span>
              <span className="min-w-0 flex-1 truncate font-semibold text-slate-900">
                {courseName(s.course_id)}
              </span>
              <Badge color={modalityColor(s.modality)}>{modalityLabel(s.modality)}</Badge>
              {roomName(s.room_id) && (
                <span className="flex-none text-slate-500">{roomName(s.room_id)}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
