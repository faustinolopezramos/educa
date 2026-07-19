import { useState } from "react";
import { useSearchParams } from "react-router-dom";

import { useAuth } from "../../auth/AuthContext";
import { Badge, Button, Card, EmptyState, SectionHeading, Stat } from "../../components/ui";
import { PromptModal } from "../../components/PromptModal";
import { useLocationProposals, useReport, useRooms, useUsers } from "../../lib/queries";
import { useReviewProposal } from "../../lib/queries";
import { notify } from "../../lib/toast";
import type { AtRiskStudent, LocationProposal } from "../../lib/types";
import { onMutationError } from "./shared";

export function InicioPanel() {
  const { user } = useAuth();
  const [, setParams] = useSearchParams();
  const { data: students = [] } = useUsers("student");
  const { data: pending = [] } = useLocationProposals("pending");
  const { data: report, isLoading } = useReport("week");

  const attendance = report?.attendance_rate;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-sm text-slate-500">
            Hola, {user?.full_name?.split(" ")[0]}
          </div>
          <h1 className="font-serif text-3xl font-medium tracking-tight text-slate-900">
            Resumen de la academia
          </h1>
        </div>
        <Button onClick={() => setParams({ m: "enrollments" })}>+ Matricular</Button>
      </div>

      <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Alumnos" value={students.length} hint="registrados" />
        <Stat
          label="Clases esta semana"
          value={isLoading ? "…" : (report?.sessions_total ?? 0)}
          hint={report ? `${report.sessions_held} realizadas` : ""}
        />
        <Stat
          label="Asistencia media"
          value={attendance == null ? "—" : `${Math.round(attendance * 100)}%`}
          hint="últimos 7 días"
        />
        <Stat
          tone="dark"
          label="Requieren tu atención"
          value={pending.length}
          hint="ubicaciones por aprobar"
        />
      </div>

      <PendingInbox
        pending={pending}
        atRisk={report?.at_risk ?? []}
        onSeeAll={() => setParams({ m: "pendientes" })}
      />
    </div>
  );
}

function PendingInbox({
  pending,
  atRisk,
  onSeeAll,
}: {
  pending: LocationProposal[];
  atRisk: AtRiskStudent[];
  onSeeAll: () => void;
}) {
  const { data: teachers = [] } = useUsers("teacher");
  const { data: rooms = [] } = useRooms();
  const review = useReviewProposal();
  const [rejecting, setRejecting] = useState<number | null>(null);

  const teacherName = (id: number) =>
    teachers.find((t) => t.id === id)?.full_name ?? `#${id}`;
  const roomName = (id: number | null) =>
    id == null ? "—" : (rooms.find((r) => r.id === id)?.name ?? `#${id}`);

  const empty = pending.length === 0 && atRisk.length === 0;

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <SectionHeading className="mb-0">Bandeja de pendientes</SectionHeading>
        <button
          onClick={onSeeAll}
          className="text-sm font-semibold text-brand-600 hover:text-brand-700"
        >
          Ver todo
        </button>
      </div>
      {empty ? (
        <EmptyState
          icon="✓"
          title="Todo al día"
          message="No hay ubicaciones por aprobar ni alumnos en riesgo esta semana."
        />
      ) : (
        <div className="space-y-2.5">
          {pending.map((p) => (
            <div
              key={p.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3"
            >
              <Badge color="amber" dot>
                Ubicación
              </Badge>
              <div className="min-w-0 flex-1 text-sm text-slate-700">
                <strong>{teacherName(p.proposed_by)}</strong> propone{" "}
                {p.modality === "virtual" ? (
                  <span className="text-slate-500">Virtual · {p.join_url}</span>
                ) : (
                  <span className="text-slate-500">{roomName(p.room_id)}</span>
                )}
              </div>
              <div className="flex gap-1.5">
                <Button
                  className="px-3 py-1.5 text-xs"
                  disabled={review.isPending}
                  onClick={() =>
                    review.mutate(
                      { id: p.id, action: "approve" },
                      {
                        onSuccess: () => notify("Propuesta aprobada", "success"),
                        onError: onMutationError("No se pudo aprobar"),
                      },
                    )
                  }
                >
                  Aprobar
                </Button>
                <Button
                  variant="secondary"
                  className="px-3 py-1.5 text-xs text-red-700"
                  onClick={() => setRejecting(p.id)}
                >
                  Rechazar
                </Button>
              </div>
            </div>
          ))}
          {atRisk.map((r) => (
            <div
              key={`${r.student_id}-${r.course_id}`}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-red-100 bg-red-50 px-4 py-3"
            >
              <Badge color="red" dot>
                Riesgo
              </Badge>
              <div className="min-w-0 flex-1 text-sm text-slate-700">
                <strong>{r.student_name}</strong> en <strong>{r.course_name}</strong>{" "}
                <span className="text-slate-500">
                  · asist. {r.attendance_rate == null ? "—" : `${Math.round(r.attendance_rate * 100)}%`}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
      {rejecting != null && (
        <PromptModal
          title="Rechazar propuesta"
          label="Motivo del rechazo (opcional)"
          placeholder="Ej. usa el aula 3 en lugar de virtual"
          confirmLabel="Rechazar"
          confirmVariant="danger"
          multiline
          busy={review.isPending}
          onClose={() => setRejecting(null)}
          onSubmit={(note: string) =>
            review.mutate(
              { id: rejecting, action: "reject", note: note || undefined },
              {
                onSuccess: () => {
                  setRejecting(null);
                  notify("Propuesta rechazada", "success");
                },
                onError: (e) => {
                  setRejecting(null);
                  onMutationError("No se pudo rechazar")(e);
                },
              },
            )
          }
        />
      )}
    </Card>
  );
}
