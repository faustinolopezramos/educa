import { useSearchParams } from "react-router-dom";

import { Card } from "../../components/ui";
import { useDashboard } from "../../lib/queries";

/**
 * The academy at a glance: how much is being taught, to how many, and how full.
 *
 * The three numbers the home screen used to show — students, classes this week,
 * attendance rate — described activity but not capacity, so the one question an
 * academy lives on ("are we filling the courses we are running?") had no answer
 * anywhere in the app.
 *
 * Occupancy counts only active courses. A rate that included drafts and
 * archives would read low for a full academy simply because somebody left a
 * draft lying around.
 */
export function AcademyKpis() {
  const { data } = useDashboard();
  const [, setParams] = useSearchParams();
  const kpis = data?.kpis;
  if (!kpis) return null;

  const occupancy = kpis.occupancy_rate;
  // Below half the seats sold is worth noticing; above 90% the academy is close
  // to turning students away.
  const occupancyTone =
    occupancy == null
      ? "text-slate-400"
      : occupancy >= 0.9
        ? "text-emerald-700"
        : occupancy < 0.5
          ? "text-amber-700"
          : "text-slate-900";

  return (
    <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Kpi
        label="Cursos activos"
        value={kpis.active_courses}
        hint={
          kpis.draft_courses > 0
            ? `${kpis.draft_courses} en borrador`
            : `${kpis.total_courses} en total`
        }
        onClick={() => setParams({ m: "courses" })}
      />
      <Kpi
        label="Alumnos matriculados"
        value={kpis.active_students}
        hint="Sin contar dos veces a quien lleva dos cursos"
        onClick={() => setParams({ m: "students" })}
      />
      <Kpi
        label="Ocupación"
        value={occupancy == null ? "—" : `${Math.round(occupancy * 100)}%`}
        valueClassName={occupancyTone}
        hint={
          kpis.seats_offered > 0
            ? `${kpis.seats_taken} de ${kpis.seats_offered} plazas`
            : "Sin plazas ofertadas"
        }
        onClick={() => setParams({ m: "courses" })}
      />
      <Kpi
        label="Profesores activos"
        value={kpis.active_teachers}
        hint="Cuentas que pueden impartir hoy"
        onClick={() => setParams({ m: "teachers" })}
      />
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  valueClassName = "text-slate-900",
  onClick,
}: {
  label: string;
  value: number | string;
  hint?: string;
  valueClassName?: string;
  onClick?: () => void;
}) {
  return (
    <Card padding="sm">
      {/* Each figure opens the screen it came from: a number you cannot act on
          is the thing this dashboard was replacing. */}
      <button
        type="button"
        onClick={onClick}
        className="w-full text-left transition-opacity hover:opacity-80"
      >
        <div className="text-2xs font-medium uppercase tracking-wider text-slate-400">
          {label}
        </div>
        <div className={`tabular mt-1 text-2xl font-bold ${valueClassName}`}>{value}</div>
        {hint && <div className="mt-0.5 text-xs text-slate-500">{hint}</div>}
      </button>
    </Card>
  );
}
