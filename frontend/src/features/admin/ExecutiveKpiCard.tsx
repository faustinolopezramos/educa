import { useSearchParams } from "react-router-dom";
import { Card } from "../../components/ui";
import { useExecutiveKpis } from "../../lib/queries";

/**
 * Executive KPI cards component displaying the headline operating figures for the academy.
 */
export function ExecutiveKpiCard() {
  const { data: kpis, isLoading } = useExecutiveKpis();
  const [, setParams] = useSearchParams();

  if (isLoading) {
    return (
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} padding="sm" className="animate-pulse">
            <div className="h-3 w-24 bg-slate-200 rounded"></div>
            <div className="mt-2 h-7 w-16 bg-slate-200 rounded"></div>
            <div className="mt-1 h-3 w-32 bg-slate-100 rounded"></div>
          </Card>
        ))}
      </div>
    );
  }

  if (!kpis) return null;

  const occupancy = kpis.occupancy_rate;
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
      {/* Card 1: Cursos Activos */}
      <KpiCard
        label="Cursos activos"
        value={kpis.active_courses}
        hint={
          kpis.draft_courses > 0
            ? `${kpis.draft_courses} en borrador`
            : `${kpis.total_courses} en total`
        }
        onClick={() => setParams({ m: "courses" })}
      />

      {/* Card 2: Alumnos Inscritos */}
      <KpiCard
        label="Alumnos inscritos"
        value={kpis.active_students}
        hint="Estudiantes activos con matrícula"
        onClick={() => setParams({ m: "students" })}
      />

      {/* Card 3: Profesores en Plantilla */}
      <KpiCard
        label="Profesores en plantilla"
        value={kpis.active_teachers}
        hint="Docentes cualificados habilitados"
        onClick={() => setParams({ m: "teachers" })}
      />

      {/* Card 4: Ocupación Académica */}
      <KpiCard
        label="Ocupación académica"
        value={occupancy == null ? "—" : `${Math.round(occupancy * 100)}%`}
        valueClassName={occupancyTone}
        hint={
          kpis.seats_offered > 0
            ? `${kpis.seats_taken} de ${kpis.seats_offered} cupos ocupados`
            : "Sin cupos ofertados"
        }
        onClick={() => setParams({ m: "courses" })}
      />
    </div>
  );
}

function KpiCard({
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
      <button
        type="button"
        onClick={onClick}
        className="w-full text-left transition-opacity hover:opacity-80"
      >
        <div className="text-2xs font-medium uppercase tracking-wider text-slate-400">
          {label}
        </div>
        <div className={`tabular mt-1 text-2xl font-bold ${valueClassName}`}>{value}</div>
        {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
      </button>
    </Card>
  );
}
