import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Badge, Button, Card, SectionHeading } from "../../components/ui";
import { useEnrollments, useAcademyPayrollSummary } from "../../lib/queries";
import { useMoney } from "../../lib/useMoney";
import { openQuickPay } from "../enrollments/QuickPayModal";

function firstDayOfMonth(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function AcademyFinancialSummary() {
  const { money } = useMoney();
  const [, setParams] = useSearchParams();

  const { data: enrollments = [] } = useEnrollments();
  const dateFrom = useMemo(() => firstDayOfMonth(), []);
  const dateTo = useMemo(() => todayIso(), []);
  const { data: payrollSummary } = useAcademyPayrollSummary(dateFrom, dateTo);

  const stats = useMemo(() => {
    let totalCharged = 0;
    let totalOwed = 0;
    let overdueOwed = 0;
    let overdueCount = 0;

    for (const e of enrollments) {
      totalCharged += e.amount || 0;
      const bal = Math.max(0, e.balance || 0);
      totalOwed += bal;
      if (e.payment_status === "overdue") {
        overdueOwed += bal;
        overdueCount += 1;
      }
    }

    const totalCollected = Math.max(0, totalCharged - totalOwed);
    const payroll = payrollSummary?.total_amount ?? 0;
    const margin = totalCollected - payroll;

    return {
      totalCollected,
      overdueOwed,
      overdueCount,
      payroll,
      margin,
    };
  }, [enrollments, payrollSummary]);

  return (
    <Card padding="sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div>
          <SectionHeading>Salud Financiera del Ciclo</SectionHeading>
          <p className="text-2xs text-slate-500">
            Resumen de cobros, cartera vencida y compromiso de nómina docente del mes en curso.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => openQuickPay()}
            className="border-emerald-200 text-emerald-800 hover:bg-emerald-50"
          >
            💵 Cobro Rápido
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setParams({ m: "nomina" })}
            className="text-2xs text-slate-600"
          >
            Nómina →
          </Button>
        </div>
      </div>

      <div className="mt-3.5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Recaudación */}
        <div className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-3">
          <div className="text-2xs font-semibold uppercase tracking-wider text-slate-500">
            Cobrado en Matrículas
          </div>
          <div className="mt-1 font-mono text-lg font-bold text-emerald-700 tabular">
            {money(stats.totalCollected)}
          </div>
          <div className="mt-0.5 text-2xs text-slate-500">Total recaudado de alumnos</div>
        </div>

        {/* Cartera en Mora */}
        <div className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-3">
          <div className="flex items-center justify-between">
            <span className="text-2xs font-semibold uppercase tracking-wider text-slate-500">
              Cartera en Mora
            </span>
            {stats.overdueCount > 0 && (
              <Badge color="red">{stats.overdueCount} alumnos</Badge>
            )}
          </div>
          <div
            className={`mt-1 font-mono text-lg font-bold tabular ${
              stats.overdueOwed > 0 ? "text-red-700" : "text-slate-900"
            }`}
          >
            {money(stats.overdueOwed)}
          </div>
          <div className="mt-0.5 text-2xs text-slate-500">
            {stats.overdueCount > 0 ? (
              <button
                type="button"
                onClick={() => setParams({ m: "enrollments", status: "overdue" })}
                className="text-brand-600 hover:underline"
              >
                Ver alumnos en mora →
              </button>
            ) : (
              "Todo al día"
            )}
          </div>
        </div>

        {/* Nómina Docente */}
        <div className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-3">
          <div className="text-2xs font-semibold uppercase tracking-wider text-slate-500">
            Nómina Docente Estimada
          </div>
          <div className="mt-1 font-mono text-lg font-bold text-slate-900 tabular">
            {money(stats.payroll)}
          </div>
          <div className="mt-0.5 text-2xs text-slate-500">
            {payrollSummary?.total_hours != null
              ? `${payrollSummary.total_hours.toFixed(1)} hrs impartidas`
              : "Horas impartidas este mes"}
          </div>
        </div>

        {/* Margen Operativo */}
        <div className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-3">
          <div className="text-2xs font-semibold uppercase tracking-wider text-slate-500">
            Margen de Cobro - Nómina
          </div>
          <div
            className={`mt-1 font-mono text-lg font-bold tabular ${
              stats.margin >= 0 ? "text-emerald-700" : "text-red-700"
            }`}
          >
            {money(stats.margin)}
          </div>
          <div className="mt-0.5 text-2xs text-slate-500">Balance operativo estimado</div>
        </div>
      </div>
    </Card>
  );
}
