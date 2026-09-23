import { useState } from "react";
import { Button, Card, Input, Modal, ModalActions, PageTitle, SectionHeading } from "../../components/ui";
import {
  useAcademyPayrollSummary,
  useTeacherPayroll,
  useUpdateTeacherRate,
} from "../../lib/queries";
import { notify } from "../../lib/toast";
import { apiErrorMessage } from "../../lib/api";
import { formatTime } from "../../lib/format";
import type { TeacherPayrollSummary } from "../../lib/types";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function firstDayOfMonth(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

function prevMonthRange(): { from: string; to: string } {
  const now = new Date();
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastDayPrev = new Date(now.getFullYear(), now.getMonth(), 0);
  const y = prevMonth.getFullYear();
  const m = String(prevMonth.getMonth() + 1).padStart(2, "0");
  const d = String(lastDayPrev.getDate()).padStart(2, "0");
  return {
    from: `${y}-${m}-01`,
    to: `${y}-${m}-${d}`,
  };
}

export function TeacherPayrollPanel() {
  const [dateFrom, setDateFrom] = useState(firstDayOfMonth());
  const [dateTo, setDateTo] = useState(todayIso());
  const [selectedTeacher, setSelectedTeacher] = useState<TeacherPayrollSummary | null>(null);
  const [editingTeacher, setEditingTeacher] = useState<TeacherPayrollSummary | null>(null);
  const [newRate, setNewRate] = useState<number>(0);
  // Desde cuándo rige la tarifa nueva. Por defecto hoy: una subida no debe
  // recalcular meses ya liquidados.
  const [rateFrom, setRateFrom] = useState<string>(() => new Date().toISOString().slice(0, 10));

  const { data: summary, isLoading, isError } = useAcademyPayrollSummary(dateFrom, dateTo);
  const updateRate = useUpdateTeacherRate();

  const handleUpdateRate = () => {
    if (!editingTeacher) return;
    updateRate.mutate(
      {
        teacherId: editingTeacher.teacher_id,
        hourlyRate: Number(newRate),
        effectiveFrom: rateFrom,
      },
      {
        onSuccess: () => {
          notify(`Tarifa de ${editingTeacher.teacher_name} actualizada`, "success");
          setEditingTeacher(null);
        },
        onError: (err) => {
          notify(apiErrorMessage(err, "No se pudo actualizar la tarifa"), "error");
        },
      },
    );
  };

  const handleExportCsv = () => {
    if (!summary || !summary.teachers.length) return;
    const headers = ["ID Profesor", "Nombre", "Email", "Tarifa por Hora", "Sesiones Dadas", "Horas Impartidas", "Total a Pagar"];
    const rows = summary.teachers.map((t) => [
      t.teacher_id,
      `"${t.teacher_name}"`,
      t.email,
      t.hourly_rate.toFixed(2),
      t.total_sessions,
      t.total_hours.toFixed(2),
      t.total_amount.toFixed(2),
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `nomina_docente_${dateFrom}_al_${dateTo}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <PageTitle subtitle="Gestión y Control de Honorarios Docentes">
            Liquidación de Horas / Nómina
          </PageTitle>
        </div>
        <Button variant="secondary" onClick={handleExportCsv} disabled={!summary?.teachers.length}>
          📥 Exportar CSV
        </Button>
      </div>

      {/* Date Filter Bar */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-4 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-medium text-slate-600">Desde:</span>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="max-w-[10rem] text-xs"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="font-medium text-slate-600">Hasta:</span>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="max-w-[10rem] text-xs"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setDateFrom(firstDayOfMonth());
                setDateTo(todayIso());
              }}
            >
              Este mes
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                const range = prevMonthRange();
                setDateFrom(range.from);
                setDateTo(range.to);
              }}
            >
              Mes anterior
            </Button>
          </div>
        </div>
      </Card>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <span className="text-2xs uppercase tracking-wider text-slate-400 font-semibold">
            Profesores con Clases
          </span>
          <div className="mt-1 text-2xl font-bold text-slate-900">
            {summary?.total_teachers ?? 0}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <span className="text-2xs uppercase tracking-wider text-slate-400 font-semibold">
            Total Horas Impartidas
          </span>
          <div className="mt-1 text-2xl font-bold text-brand-600">
            {summary?.total_hours?.toFixed(1) ?? "0.0"} h
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <span className="text-2xs uppercase tracking-wider text-slate-400 font-semibold">
            Total a Liquidar
          </span>
          <div className="mt-1 text-2xl font-bold text-emerald-600">
            ${summary?.total_amount?.toFixed(2) ?? "0.00"}
          </div>
        </div>
      </div>

      {/* Teachers Table */}
      <Card>
        <SectionHeading>Desglose por Docente</SectionHeading>
        {isLoading ? (
          <p className="py-8 text-center text-xs text-slate-500">Calculando horas y honorarios…</p>
        ) : isError ? (
          <p className="py-8 text-center text-xs text-red-600">No se pudo cargar la liquidación de nómina.</p>
        ) : !summary || summary.teachers.length === 0 ? (
          <p className="py-8 text-center text-xs text-slate-400">
            No se registraron clases dadas en el período seleccionado.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50/75 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-semibold">Profesor</th>
                  <th className="px-4 py-3 font-semibold">Tarifa / Hora</th>
                  <th className="px-4 py-3 font-semibold text-center">Sesiones Impartidas</th>
                  <th className="px-4 py-3 font-semibold text-right">Horas Totales</th>
                  <th className="px-4 py-3 font-semibold text-right">Total Devengado</th>
                  <th className="px-4 py-3 font-semibold text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {summary.teachers.map((t) => (
                  <tr key={t.teacher_id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-900">{t.teacher_name}</div>
                      <div className="text-2xs text-slate-400">{t.email}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-slate-800">
                          ${t.hourly_rate.toFixed(2)}/h
                        </span>
                        <button
                          type="button"
                          className="text-2xs text-brand-600 hover:underline"
                          onClick={() => {
                            setEditingTeacher(t);
                            setNewRate(t.hourly_rate);
                          }}
                        >
                          ✎
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">{t.total_sessions}</td>
                    <td className="px-4 py-3 text-right font-medium text-brand-700">
                      {t.total_hours.toFixed(1)} h
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-emerald-700">
                      ${t.total_amount.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Button
                        variant="secondary"
                        size="sm"
                        className="text-2xs"
                        onClick={() => setSelectedTeacher(t)}
                      >
                        Ver sesiones →
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Modal: Edit Hourly Rate */}
      {editingTeacher && (
        <Modal
          title={`Tarifa Horaria - ${editingTeacher.teacher_name}`}
          onClose={() => setEditingTeacher(null)}
        >
          <div className="space-y-3">
            <p className="text-xs text-slate-600">
              Establece la remuneración por hora de clase impartida para este
              docente. Cada clase se liquida con la tarifa vigente el día en que
              se impartió, así que las liquidaciones anteriores a la fecha de
              vigencia no cambian.
            </p>
            <label className="block text-xs font-medium text-slate-700">
              Tarifa por Hora ($)
              <Input
                type="number"
                step="0.5"
                min="0"
                value={newRate}
                onChange={(e) => setNewRate(Number(e.target.value))}
                className="mt-1"
              />
            </label>
            <label className="block text-xs font-medium text-slate-700">
              Vigente desde
              <Input
                type="date"
                value={rateFrom}
                onChange={(e) => setRateFrom(e.target.value)}
                className="mt-1"
              />
            </label>
          </div>
          <ModalActions>
            <Button variant="secondary" onClick={() => setEditingTeacher(null)}>
              Cancelar
            </Button>
            <Button
              disabled={updateRate.isPending}
              onClick={handleUpdateRate}
              className="bg-brand-600 text-white"
            >
              {updateRate.isPending ? "Guardando…" : "Guardar Tarifa"}
            </Button>
          </ModalActions>
        </Modal>
      )}

      {/* Modal: Teacher Detail Sessions */}
      {selectedTeacher && (
        <TeacherDetailModal
          teacher={selectedTeacher}
          dateFrom={dateFrom}
          dateTo={dateTo}
          onClose={() => setSelectedTeacher(null)}
        />
      )}
    </div>
  );
}

function TeacherDetailModal({
  teacher,
  dateFrom,
  dateTo,
  onClose,
}: {
  teacher: TeacherPayrollSummary;
  dateFrom: string;
  dateTo: string;
  onClose: () => void;
}) {
  const { data: report, isLoading } = useTeacherPayroll(teacher.teacher_id, dateFrom, dateTo);

  return (
    <Modal title={`Detalle de Sesiones: ${teacher.teacher_name}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3 text-xs">
          <div>
            <span className="text-slate-500">Período:</span>{" "}
            <span className="font-semibold text-slate-800">{dateFrom} al {dateTo}</span>
          </div>
          <div>
            <span className="text-slate-500">Tarifa aplicada:</span>{" "}
            <span className="font-semibold text-slate-800">${teacher.hourly_rate.toFixed(2)}/h</span>
          </div>
        </div>

        {isLoading ? (
          <p className="py-6 text-center text-xs text-slate-500">Cargando sesiones…</p>
        ) : !report || report.sessions.length === 0 ? (
          <p className="py-6 text-center text-xs text-slate-400">No se encontraron sesiones registradas.</p>
        ) : (
          <div className="max-h-80 overflow-y-auto pr-1">
            <table className="w-full text-left text-2xs">
              <thead className="sticky top-0 bg-white border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="py-2 px-2 font-semibold">Fecha</th>
                  <th className="py-2 px-2 font-semibold">Curso</th>
                  <th className="py-2 px-2 font-semibold">Horario</th>
                  <th className="py-2 px-2 font-semibold text-right">Duración</th>
                  <th className="py-2 px-2 font-semibold text-right">Importe</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {report.sessions.map((s) => (
                  <tr key={s.session_id} className="hover:bg-slate-50/50">
                    <td className="py-2 px-2 font-medium">{s.date}</td>
                    <td className="py-2 px-2 truncate max-w-[10rem]">{s.course_name}</td>
                    <td className="py-2 px-2">
                      {formatTime(s.start_time)}–{formatTime(s.end_time)}
                    </td>
                    <td className="py-2 px-2 text-right">{s.duration_hours.toFixed(1)} h</td>
                    <td className="py-2 px-2 text-right font-bold text-emerald-700">
                      ${s.amount.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-xs font-semibold">
          <span>Total devengado:</span>
          <span className="text-emerald-700 text-sm font-bold">
            ${report?.total_amount.toFixed(2) ?? "0.00"} ({report?.total_hours.toFixed(1) ?? 0} h)
          </span>
        </div>
      </div>

      <ModalActions>
        <Button variant="secondary" onClick={onClose}>
          Cerrar
        </Button>
      </ModalActions>
    </Modal>
  );
}
