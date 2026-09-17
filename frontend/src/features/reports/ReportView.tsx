import { useState } from "react";

import {
  Badge,
  Button,
  Card,
  Input,
  PageHeader,
  SectionHeading,
  SegmentedControl,
  SkeletonRows,
  Stat,
} from "../../components/ui";
import { notify } from "../../lib/toast";
import { downloadReport, useRaiseAtRiskAlerts, useReport } from "../../lib/queries";
import type { ReportPeriod } from "../../lib/types";

import { ConsolidatedPerformanceView } from "./ConsolidatedPerformanceView";

const PERIODS: { value: ReportPeriod; label: string }[] = [
  { value: "day", label: "Día" },
  { value: "week", label: "Semana" },
  { value: "month", label: "Mes" },
];

function pct(rate: number | null): string {
  return rate == null ? "—" : `${Math.round(rate * 100)}%`;
}

export function ReportView() {
  const [activeTab, setActiveTab] = useState<"consolidated" | "standard">("consolidated");
  const [period, setPeriod] = useState<ReportPeriod>("month");
  const [anchor, setAnchor] = useState<string>("");
  const { data: report, isLoading } = useReport(period, anchor || undefined);
  const raiseAlerts = useRaiseAtRiskAlerts();

  return (
    <div>
      <PageHeader
        title="Reportes"
        description="La nota consolidada pondera 40% tareas, 50% exámenes y 10% asistencia."
        actions={
          <>
            <Button
              variant="secondary"
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
              onClick={() =>
                downloadReport("csv", period, anchor || undefined).catch(() =>
                  notify("No se pudo descargar el CSV", "error"),
                )
              }
            >
              Descargar CSV
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2.5 rounded-xl border border-slate-200 bg-white p-2.5">
        <SegmentedControl
          value={activeTab}
          onChange={setActiveTab}
          options={[
            { value: "consolidated", label: "Rendimiento" },
            { value: "standard", label: "Sesiones" },
          ]}
        />
        <div className="ml-auto flex items-center gap-2">
          <SegmentedControl value={period} onChange={setPeriod} options={PERIODS} />
          <Input
            type="date"
            aria-label="Fecha de referencia del periodo"
            className="w-auto"
            value={anchor}
            onChange={(e) => setAnchor(e.target.value)}
          />
        </div>
      </div>

      {isLoading || !report ? (
        <SkeletonRows rows={4} />
      ) : activeTab === "consolidated" ? (
        <ConsolidatedPerformanceView report={report} />
      ) : (
        <div className="space-y-4">
          <p className="text-xs text-slate-500">
            Del <strong className="font-semibold text-slate-900">{report.date_from}</strong> al{" "}
            <strong className="font-semibold text-slate-900">{report.date_to}</strong>
          </p>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Stat label="Sesiones ofertadas" value={report.sessions_total} />
            {/* "Realizadas" now means a class whose register was taken, so
                anything still without one shows up beside it instead of being
                silently counted as taught. */}
            <Stat label="Sesiones realizadas" value={report.sessions_held} />
            <Stat label="Sin registrar" value={report.sessions_pending} />
            <Stat label="Asistencia" value={pct(report.attendance_rate)} />
            <Stat label="Promedio de notas" value={report.grade_average ?? "—"} />
          </div>

          {report.skills_overview && Object.keys(report.skills_overview).length > 0 && (
            <Card className="border-slate-200 bg-white">
              <SectionHeading>Promedios por Competencia Lingüística (MCER)</SectionHeading>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                {Object.entries(report.skills_overview).map(([skill, score]) => (
                  <div key={skill} className="rounded-lg bg-slate-50 p-3 border border-slate-200">
                    <div className="text-2xs font-semibold uppercase tracking-wider text-slate-500 capitalize">
                      {skill === "speaking"
                        ? "Speaking"
                        : skill === "listening"
                          ? "Listening"
                          : skill === "reading"
                            ? "Reading"
                            : skill === "writing"
                              ? "Writing"
                              : skill === "grammar"
                                ? "Grammar"
                                : skill === "use_of_language"
                                  ? "Use of Lang"
                                  : skill}
                    </div>
                    <div
                      className={`mt-1 text-xl font-bold tabular ${
                        score < 6.0 ? "text-red-600" : "text-slate-900"
                      }`}
                    >
                      {score.toFixed(1)} <span className="text-xs font-normal text-slate-400">/ 10</span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <div className="grid items-start gap-4 lg:grid-cols-2">
            <Card>
              <SectionHeading>Asistencia por curso</SectionHeading>
              {report.attendance_by_course.length === 0 ? (
                <p className="text-sm text-slate-500">Sin registros en el periodo.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {report.attendance_by_course.map((c) => (
                    <li
                      key={c.course_id}
                      className="flex items-center justify-between gap-3 py-2 text-sm"
                    >
                      <span className="min-w-0 truncate text-slate-700">{c.course_name}</span>
                      <span className="tabular flex-none text-slate-500">
                        {c.present}/{c.total}
                        <strong className="ml-2 font-semibold text-slate-900">
                          {pct(c.rate)}
                        </strong>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <SectionHeading className="!mb-0">
                  Alumnos en riesgo ({report.at_risk.length})
                </SectionHeading>
                {report.at_risk.length > 0 && (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={raiseAlerts.isPending}
                    onClick={() =>
                      raiseAlerts.mutate(
                        { period, anchor: anchor || undefined },
                        {
                          onSuccess: (data) =>
                            notify(
                              `Se enviaron ${data.alerts} alertas tempranas a docentes y coordinación`,
                              "success",
                            ),
                          onError: () => notify("No se pudieron enviar las alertas", "error"),
                        },
                      )
                    }
                  >
                    {raiseAlerts.isPending ? "Notificando…" : "🔔 Notificar alertas"}
                  </Button>
                )}
              </div>
              {report.at_risk.length === 0 ? (
                <p className="text-sm text-slate-500">
                  Nadie en riesgo en este periodo.
                </p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {report.at_risk.map((r) => (
                    <li
                      key={`${r.student_id}-${r.course_id}`}
                      className="flex flex-wrap items-center justify-between gap-2 py-2.5"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-slate-900">
                          {r.student_name}
                        </div>
                        <div className="truncate text-xs text-slate-500">{r.course_name}</div>
                      </div>
                      <div className="flex flex-none items-center gap-2">
                        <span className="tabular text-xs text-slate-500">
                          {pct(r.attendance_rate)}
                          {r.average != null && ` · ${r.average}`}
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
