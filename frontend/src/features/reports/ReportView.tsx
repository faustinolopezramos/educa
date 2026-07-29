import { useState } from "react";

import { Badge, Button, Card } from "../../components/ui";
import { notify } from "../../lib/toast";
import { downloadReport, useReport } from "../../lib/queries";
import type { ReportPeriod } from "../../lib/types";

import { ConsolidatedPerformanceView } from "./ConsolidatedPerformanceView";

const PERIODS: { id: ReportPeriod; label: string }[] = [
  { id: "day", label: "Día" },
  { id: "week", label: "Semana" },
  { id: "month", label: "Mes" },
];

function pct(rate: number | null): string {
  return rate == null ? "—" : `${Math.round(rate * 100)}%`;
}

export function ReportView() {
  const [activeTab, setActiveTab] = useState<"consolidated" | "standard">("consolidated");
  const [period, setPeriod] = useState<ReportPeriod>("month");
  const [anchor, setAnchor] = useState<string>("");
  const { data: report, isLoading } = useReport(period, anchor || undefined);

  return (
    <div className="space-y-4">
      {/* Executive Ultra-Clean Top Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600 font-bold text-lg">
            📊
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-serif text-xl font-bold text-slate-900">
                Reportes & Rendimiento
              </h2>
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                360°
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Supervisión de calificaciones consolidada (40% Tareas + 50% Exámenes + 10% Asistencia).
            </p>
          </div>
        </div>

        {/* View Mode Switcher */}
        <div className="flex items-center rounded-lg bg-slate-100 p-1 text-xs font-medium">
          <button
            onClick={() => setActiveTab("consolidated")}
            className={`rounded-md px-3 py-1.5 transition ${
              activeTab === "consolidated"
                ? "bg-white text-slate-900 shadow-2xs font-semibold"
                : "text-slate-500 hover:text-slate-900"
            }`}
          >
            📊 Rendimiento 360°
          </button>
          <button
            onClick={() => setActiveTab("standard")}
            className={`rounded-md px-3 py-1.5 transition ${
              activeTab === "standard"
                ? "bg-white text-slate-900 shadow-2xs font-semibold"
                : "text-slate-500 hover:text-slate-900"
            }`}
          >
            📋 Operativo Sesiones
          </button>
        </div>
      </div>

      {/* Control Strip (Period, Date Picker & Downloads) */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200/80 shadow-2xs text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-slate-400 font-medium mr-1">Periodo:</span>
          <div className="flex items-center rounded-lg bg-slate-100 p-0.5">
            {PERIODS.map((p) => (
              <button
                key={p.id}
                onClick={() => setPeriod(p.id)}
                className={`rounded-md px-2.5 py-1 font-semibold transition ${
                  period === p.id
                    ? "bg-white text-slate-900 shadow-2xs"
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <input
            type="date"
            value={anchor}
            onChange={(e) => setAnchor(e.target.value)}
            className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700 outline-none focus:bg-white focus:border-brand-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            className="text-xs !py-1 !px-2.5 font-semibold"
            onClick={() =>
              downloadReport("pdf", period, anchor || undefined).catch(() =>
                notify("No se pudo descargar el PDF", "error"),
              )
            }
          >
            📄 PDF
          </Button>
          <Button
            variant="secondary"
            className="text-xs !py-1 !px-2.5 font-semibold"
            onClick={() =>
              downloadReport("csv", period, anchor || undefined).catch(() =>
                notify("No se pudo descargar el CSV", "error"),
              )
            }
          >
            📊 CSV
          </Button>
        </div>
      </div>

      {isLoading || !report ? (
        <Card className="p-8 text-center text-slate-400 text-xs italic">
          Cargando reporte de rendimiento…
        </Card>
      ) : activeTab === "consolidated" ? (
        <ConsolidatedPerformanceView report={report} />
      ) : (
        <div className="space-y-4">
          <div className="text-xs text-slate-500 font-medium">
            Rango de fecha: <strong className="text-slate-800">{report.date_from} → {report.date_to}</strong>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Sesiones Ofertadas" value={report.sessions_total} />
            <Stat label="Sesiones Realizadas" value={report.sessions_held} />
            <Stat label="Tasa de Asistencia" value={pct(report.attendance_rate)} />
            <Stat
              label="Promedio Evaluaciones"
              value={report.grade_average ?? "—"}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2 items-start">
            <Card className="p-4 space-y-3 rounded-2xl border border-slate-200/80 bg-white shadow-2xs">
              <h4 className="font-semibold text-sm text-slate-900 border-b border-slate-100 pb-2">
                Asistencia por Curso
              </h4>
              {report.attendance_by_course.length === 0 ? (
                <p className="text-xs text-slate-400 italic">Sin registros en el periodo.</p>
              ) : (
                <ul className="space-y-1.5 text-xs">
                  {report.attendance_by_course.map((c) => (
                    <li
                      key={c.course_id}
                      className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 border border-slate-100/80"
                    >
                      <span className="font-medium text-slate-800">{c.course_name}</span>
                      <span className="text-slate-500 font-mono">
                        {c.present}/{c.total} ({pct(c.rate)})
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card className="p-4 space-y-3 rounded-2xl border border-slate-200/80 bg-white shadow-2xs">
              <h4 className="font-semibold text-sm text-slate-900 border-b border-slate-100 pb-2">
                Alumnos en Alerta o Riesgo
              </h4>
              {report.at_risk.length === 0 ? (
                <p className="text-xs text-slate-400 italic">No hay alumnos en riesgo en este periodo.</p>
              ) : (
                <ul className="space-y-1.5 text-xs">
                  {report.at_risk.map((r) => (
                    <li
                      key={`${r.student_id}-${r.course_id}`}
                      className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50/70 px-3 py-2"
                    >
                      <div>
                        <div className="font-semibold text-red-950">{r.student_name}</div>
                        <div className="text-[11px] text-slate-500">{r.course_name}</div>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-slate-600 font-medium">
                          {pct(r.attendance_rate)}
                          {r.average != null && ` · Prom. ${r.average}`}
                        </span>
                        {r.reasons.map((reason) => (
                          <Badge key={reason} color="red">
                            {reason}
                          </Badge>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="p-4 rounded-2xl border border-slate-200/80 bg-white shadow-2xs">
      <div className="text-xs text-slate-500 font-medium">{label}</div>
      <div className="mt-1 font-serif text-2xl font-bold text-slate-900">{value}</div>
    </Card>
  );
}
