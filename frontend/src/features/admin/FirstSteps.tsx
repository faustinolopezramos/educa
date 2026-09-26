import { useSearchParams } from "react-router-dom";

import { Button, Card } from "../../components/ui";
import { IconCheck } from "../../components/icons";
import type { SetupStep } from "../../lib/types";

/**
 * Primeros pasos de una academia nueva, en su inicio.
 *
 * Una academia recién creada abría su inicio y leía «No hay nada pendiente.
 * Todo al día» sobre una pantalla de ceros. El camino hasta la primera clase
 * tiene un orden —un curso necesita nivel, abrirlo exige profesor y horario— y
 * no estaba escrito en ninguna parte. Aquí está, con el siguiente paso a un
 * toque; desaparece en cuanto la academia matricula a su primer alumno.
 */
export function FirstSteps({ steps }: { steps: SetupStep[] }) {
  const [, setParams] = useSearchParams();
  const done = steps.filter((s) => s.done).length;
  const next = steps.find((s) => !s.done);
  if (!next) return null;

  return (
    <Card className="mb-4 border-brand-200">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-base font-bold text-slate-900">Pon en marcha tu academia</h2>
          <p className="text-sm text-slate-500">
            Siete pasos hasta tu primera clase. Puedes volver aquí cuando quieras.
          </p>
        </div>
        <span className="tabular text-xs font-semibold text-slate-500">
          {done} de {steps.length}
        </span>
      </div>

      <div
        className="mb-4 h-1.5 overflow-hidden rounded-full bg-slate-100"
        role="progressbar"
        aria-valuenow={done}
        aria-valuemin={0}
        aria-valuemax={steps.length}
        aria-label="Pasos completados"
      >
        <div
          className="h-full rounded-full bg-brand-500"
          style={{ width: `${(done / steps.length) * 100}%` }}
        />
      </div>

      <ol className="space-y-1.5">
        {steps.map((step, i) => {
          const isNext = step === next;
          return (
            <li
              key={step.key}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 ${
                isNext ? "bg-brand-50" : ""
              }`}
            >
              <span
                className={`flex h-6 w-6 flex-none items-center justify-center rounded-full text-xs font-bold ${
                  step.done
                    ? "bg-emerald-100 text-emerald-700"
                    : isNext
                      ? "bg-brand-600 text-white"
                      : "bg-slate-100 text-slate-500"
                }`}
                aria-hidden="true"
              >
                {step.done ? <IconCheck className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p
                  className={`text-sm font-semibold ${
                    step.done ? "text-slate-400 line-through" : "text-slate-900"
                  }`}
                >
                  {step.label}
                  {step.done && <span className="sr-only"> (hecho)</span>}
                </p>
                {isNext && <p className="text-xs text-slate-600">{step.hint}</p>}
              </div>
              {isNext && (
                <Button size="sm" onClick={() => setParams({ m: step.section })}>
                  Empezar
                </Button>
              )}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
