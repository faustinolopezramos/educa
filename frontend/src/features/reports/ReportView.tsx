import { useState } from "react";

import { Badge, Button, Card } from "../../components/ui";
import { notify } from "../../lib/toast";
import { downloadReport, useReport } from "../../lib/queries";
import type { ReportPeriod } from "../../lib/types";

const PERIODS: { id: ReportPeriod; label: string }[] = [
  { id: "day", label: "Día" },
  { id: "week", label: "Semana" },
  { id: "month", label: "Mes" },
];

function pct(rate: number | null): string {
  return rate == null ? "—" : `${Math.round(rate * 100)}%`;
}

/** Daily / weekly / monthly report, scoped by the caller's role on the server. */
export function ReportView() {
  const [period, setPeriod] = useState<ReportPeriod>("week");
  const [anchor, setAnchor] = useState<string>("");
  const { data: report, isLoading } = useReport(period, anchor || undefined);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1">
          {PERIODS.map((p) => (
            <Button
              key={p.id}
              variant={period === p.id ? "primary" : "secondary"}
              className="text-xs"
              onClick={() => setPeriod(p.id)}
            >
              {p.label}
            </Button>
          ))}
        </div>
        <input
          type="date"
          value={anchor}
          onChange={(e) => setAnchor(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        />
        <div className="flex gap-1">
          <Button
            variant="secondary"
            className="text-xs"
            onClick={() =>
              downloadReport("pdf", period, anchor || undefined).catch(() =>
                notify("No se pudo descargar el PDF", "error"),
              )
            }
          >
            Descargar PDF
          </Button>
          <Button
            variant="secondary"
            className="text-xs"
            onClick={() =>
              downloadReport("csv", period, anchor || undefined).catch(() =>
                notify("No se pudo descargar el CSV", "error"),
              )
            }
          >
            CSV
          </Button>
        </div>
      </div>

      {isLoading || !report ? (
        <p className="text-sm text-slate-400">Cargando reporte…</p>
      ) : (
        <>
          <p className="text-xs text-slate-400">
            {report.date_from} → {report.date_to}
          </p>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Sesiones" value={report.sessions_total} />
            <Stat label="Realizadas" value={report.sessions_held} />
            <Stat label="Asistencia" value={pct(report.attendance_rate)} />
            <Stat
              label="Promedio (notas del día)"
              value={report.grade_average ?? "—"}
            />
          </div>

          <Card>
            <h4 className="mb-2 text-sm font-medium text-slate-700">
              Asistencia por curso
            </h4>
            {report.attendance_by_course.length === 0 ? (
              <p className="text-sm text-slate-400">Sin registros en el periodo.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {report.attendance_by_course.map((c) => (
                  <li
                    key={c.course_id}
                    className="flex items-center justify-between rounded bg-slate-50 px-3 py-1.5"
                  >
                    <span>{c.course_name}</span>
                    <span className="text-slate-500">
                      {c.present}/{c.total} · {pct(c.rate)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <h4 className="mb-2 text-sm font-medium text-slate-700">
              Alumnos en riesgo
            </h4>
            {report.at_risk.length === 0 ? (
              <p className="text-sm text-slate-400">Nadie en riesgo este periodo.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {report.at_risk.map((r) => (
                  <li
                    key={`${r.student_id}-${r.course_id}`}
                    className="flex items-center justify-between rounded border border-red-100 bg-red-50 px-3 py-1.5"
                  >
                    <span>
                      {r.student_name}{" "}
                      <span className="text-xs text-slate-400">· {r.course_name}</span>
                    </span>
                    <span className="flex items-center gap-2 text-xs">
                      <span className="text-slate-500">
                        Asist. {pct(r.attendance_rate)}
                        {r.average != null && ` · Prom. ${r.average}`}
                      </span>
                      {r.reasons.map((reason) => (
                        <Badge key={reason} color="red">
                          {reason}
                        </Badge>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <div className="text-xs text-slate-400">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-800">{value}</div>
    </Card>
  );
}
