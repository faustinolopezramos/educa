import { useState } from "react";

import { Button, Card, SectionHeading } from "../../components/ui";
import { PromptModal } from "../../components/PromptModal";
import { usePendingRenewals, useReviewRenewal } from "../../lib/queries";
import { notify } from "../../lib/toast";
import { onMutationError } from "./shared";

/**
 * Alumnos graduados que piden plaza en su siguiente nivel.
 *
 * Vive arriba de Matrículas y no en una sección propia: aprobar una solicitud
 * *es* abrir una matrícula, y quien lo hace ya trabaja aquí. No se dibuja nada
 * cuando no hay solicitudes — la bandeja del inicio ya avisa cuando llegan.
 *
 * Aprobar vuelve a pasar el cupo, el choque de horario y el estado del curso;
 * si el grupo se llenó desde que el alumno pidió, el error lo dice y la
 * solicitud sigue aquí para rechazarla con un motivo.
 */
export function RenewalRequestsCard() {
  const { data: pending = [] } = usePendingRenewals();
  const review = useReviewRenewal();
  const [rejecting, setRejecting] = useState<number | null>(null);

  if (pending.length === 0) return null;

  return (
    <Card padding="sm" className="mb-4 border-brand-200">
      <SectionHeading>
        Solicitudes de renovación ({pending.length})
      </SectionHeading>
      <p className="mb-3 text-xs text-slate-500">
        Al aprobar se abre la matrícula como Inscrito, con la cuota del nivel anterior. Puedes
        ajustarla después en la lista.
      </p>
      <ul className="divide-y divide-slate-100">
        {pending.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
            <div className="min-w-0 text-sm">
              <p className="font-semibold text-slate-900">{r.student_name}</p>
              <p className="text-xs text-slate-500">
                {r.from_course_name} → <span className="text-slate-700">{r.course_name}</span>
                {" · "}
                <span className="tabular">Q{r.amount.toFixed(2)}</span>
              </p>
            </div>
            <div className="flex gap-1.5">
              <Button
                size="sm"
                disabled={review.isPending}
                onClick={() =>
                  review.mutate(
                    { id: r.id, action: "approve" },
                    {
                      onSuccess: () => notify(`Matrícula abierta para ${r.student_name}`, "success"),
                      onError: onMutationError("No se pudo aprobar la solicitud"),
                    },
                  )
                }
              >
                Aprobar
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={review.isPending}
                onClick={() => setRejecting(r.id)}
              >
                Rechazar
              </Button>
            </div>
          </li>
        ))}
      </ul>

      {rejecting != null && (
        <PromptModal
          title="Rechazar solicitud"
          label="Motivo (el alumno lo verá)"
          placeholder="Ej. ese grupo se cierra; hay plaza en el dominical"
          confirmLabel="Rechazar solicitud"
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
                  notify("Solicitud rechazada", "success");
                },
                onError: (e) => {
                  setRejecting(null);
                  onMutationError("No se pudo rechazar la solicitud")(e);
                },
              },
            )
          }
        />
      )}
    </Card>
  );
}
