import { useSearchParams } from "react-router-dom";

import { useAuth } from "../../auth/AuthContext";
import { ActionTray } from "../../components/ActionTray";
import { ExecutiveKpiCard } from "./ExecutiveKpiCard";
import { Button, Card, MetaItem, PageHeader } from "../../components/ui";
import { useReport } from "../../lib/queries";
import { canSeeSection } from "../../lib/nav";
import { SchedulePlanner } from "../schedules/SchedulePlanner";

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
 */
export function InicioPanel() {
  const { user } = useAuth();
  const [, setParams] = useSearchParams();
  const { data: report } = useReport("week");

  const attendance = report?.attendance_rate;
  const firstName = user?.full_name?.split(" ")[0] ?? "";
  const canEnroll = canSeeSection(user, "enrollments");
  const canSeeCourses = canSeeSection(user, "courses");

  return (
    <div>
      <PageHeader
        title={firstName ? `Hola, ${firstName}` : "Resumen"}
        description="Lo que ocurre en la academia esta semana."
        meta={
          <>
            {/* The academy's size and capacity moved to the KPI row below; what
                stays here is how *this week* is going, which the KPIs do not
                say. "Impartidas" now means a class whose register was taken, so
                the pair reads as progress through the week rather than a total
                that was already complete on Monday morning. */}
            <MetaItem
              value={`${report?.sessions_held ?? 0}/${report?.sessions_total ?? 0}`}
              label="clases impartidas esta semana"
            />
            <MetaItem
              value={attendance == null ? "—" : `${Math.round(attendance * 100)}%`}
              label="de asistencia"
            />
          </>
        }
        actions={
          <>
            {canSeeCourses && (
              <Button variant="secondary" onClick={() => setParams({ m: "courses" })}>
                Cursos
              </Button>
            )}
            {canEnroll && (
              <Button onClick={() => setParams({ m: "enrollments" })}>
                Nueva matrícula
              </Button>
            )}
          </>
        }
      />

      <ExecutiveKpiCard />

      <ActionTray emptyMessage="No hay nada pendiente en la academia. Todo al día." />

      <Card padding="sm">
        <SchedulePlanner />
      </Card>
    </div>
  );
}
