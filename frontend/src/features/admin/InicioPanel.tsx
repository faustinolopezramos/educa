import { useState } from "react";
import { useSearchParams } from "react-router-dom";

import { useAuth } from "../../auth/AuthContext";
import { Button, Card } from "../../components/ui";
import { useLocationProposals, useReport, useUsers } from "../../lib/queries";
import { SchedulePlanner } from "../schedules/SchedulePlanner";
import { PendingModal } from "./PendingModal";

export function InicioPanel() {
  const { user } = useAuth();
  const [, setParams] = useSearchParams();
  const { data: students = [] } = useUsers("student");
  const { data: pending = [] } = useLocationProposals("pending");
  const { data: report } = useReport("week");
  const [showPendingModal, setShowPendingModal] = useState(false);

  const attendance = report?.attendance_rate;

  return (
    <div className="space-y-4">
      {/* Minimalist Ultra-Compact Top Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600 font-bold text-lg">
            🗓️
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-serif text-xl font-bold tracking-tight text-slate-900">
                Resumen Académico
              </h1>
              <span className="text-xs text-slate-400 font-medium">
                · Hola, {user?.full_name?.split(" ")[0]}
              </span>
            </div>
            {/* Inline Micro-KPI Badges */}
            <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px]">
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 font-medium text-slate-700">
                🎓 {students.length} Alumnos
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 font-medium text-slate-700">
                📅 {report?.sessions_total ?? 0} Clases esta semana
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 font-semibold text-emerald-800">
                📈 {attendance == null ? "—" : `${Math.round(attendance * 100)}%`} Asistencia
              </span>
              <button
                onClick={() => setShowPendingModal(true)}
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-semibold transition ${
                  pending.length > 0
                    ? "bg-amber-100 text-amber-900 hover:bg-amber-200 shadow-2xs"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                <span>📍 Pendientes</span>
                {pending.length > 0 && (
                  <span className="rounded-full bg-amber-600 px-1.5 py-0.2 text-[10px] text-white font-bold">
                    {pending.length}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            className="text-xs font-semibold !py-1.5 !px-3"
            onClick={() => setShowPendingModal(true)}
          >
            📍 Pendientes {pending.length > 0 && `(${pending.length})`}
          </Button>
          <Button
            variant="secondary"
            className="text-xs font-semibold !py-1.5 !px-3"
            onClick={() => setParams({ m: "courses" })}
          >
            📚 Cursos
          </Button>
          <Button
            variant="primary"
            className="text-xs font-semibold !py-1.5 !px-3 shadow-xs"
            onClick={() => setParams({ m: "enrollments" })}
          >
            + Nueva Matrícula
          </Button>
        </div>
      </div>

      {/* Slim Pending Alert Banner (if pending proposals exist) */}
      {pending.length > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-2.5 text-xs text-amber-900 shadow-2xs">
          <div className="flex items-center gap-2">
            <span className="text-amber-600 font-bold">⚠️</span>
            <span>
              Tienes <strong>{pending.length} propuestas de aula/virtual</strong> pendientes por aprobar.
            </span>
          </div>
          <button
            onClick={() => setShowPendingModal(true)}
            className="font-bold text-amber-900 underline hover:text-amber-950 text-xs"
          >
            Revisar propuestas →
          </button>
        </div>
      )}

      {/* Full Primary Schedule Calendar Section */}
      <Card className="p-5 shadow-sm border border-slate-200/80 rounded-2xl space-y-3">
        <SchedulePlanner />
      </Card>

      {/* Pending Modal Dialog */}
      {showPendingModal && (
        <PendingModal onClose={() => setShowPendingModal(false)} />
      )}
    </div>
  );
}
