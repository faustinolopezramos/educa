import { Badge, Button, Modal, ModalActions } from "../../components/ui";

/**
 * What happened to each item in a bulk action.
 *
 * A toast can say "28 de 30 matriculados", but not *which* two failed or why —
 * and those two are the whole reason the admin is still on this screen. Batch
 * operations here are deliberately not all-or-nothing, so the result needs
 * somewhere to be read line by line.
 *
 * Successes collapse into a count; failures are listed in full with their
 * reason, because those are the ones that still need a decision.
 */
export interface BulkOutcome {
  id: number;
  name: string;
  ok: boolean;
  detail?: string | null;
  reason?: string | null;
}

export function BulkResultDialog({
  title,
  outcomes,
  successLabel,
  failureLabel,
  onClose,
}: {
  title: string;
  outcomes: BulkOutcome[];
  /** e.g. "matriculado" — completes "12 alumnos matriculados". */
  successLabel: string;
  /** e.g. "sin matricular". */
  failureLabel: string;
  onClose: () => void;
}) {
  const ok = outcomes.filter((o) => o.ok);
  const failed = outcomes.filter((o) => !o.ok);

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <ModalActions>
          <Button onClick={onClose}>Entendido</Button>
        </ModalActions>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {ok.length > 0 && (
            <Badge color="green">
              {ok.length} {successLabel}
            </Badge>
          )}
          {failed.length > 0 && (
            <Badge color="red">
              {failed.length} {failureLabel}
            </Badge>
          )}
        </div>

        {failed.length > 0 && (
          <div>
            <p className="mb-2 text-sm text-slate-600">
              Estos quedaron fuera. El resto sí se aplicó:
            </p>
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {failed.map((o) => (
                <li key={o.id} className="px-3 py-2">
                  <div className="text-sm font-medium text-slate-900">{o.name}</div>
                  <div className="mt-0.5 text-xs text-red-700">
                    {o.reason ?? "No se pudo aplicar"}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {ok.length > 0 && failed.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer text-slate-600 hover:text-slate-900">
              Ver los {ok.length} que sí se aplicaron
            </summary>
            <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
              {ok.map((o) => (
                <li
                  key={o.id}
                  className="flex items-center justify-between gap-2 px-3 py-1.5"
                >
                  <span className="text-sm text-slate-800">{o.name}</span>
                  {o.detail && (
                    <span className="font-mono text-xs text-slate-500">{o.detail}</span>
                  )}
                </li>
              ))}
            </ul>
          </details>
        )}

        {failed.length === 0 && (
          <p className="text-sm text-slate-600">
            Todo se aplicó sin incidencias.
          </p>
        )}
      </div>
    </Modal>
  );
}
