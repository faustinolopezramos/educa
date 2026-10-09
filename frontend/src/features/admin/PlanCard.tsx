import { useState } from "react";

import { Badge, Button, Card, Modal, ModalActions, SectionHeading } from "../../components/ui";
import { formatDateTime } from "../../lib/format";
import { formatQuetzales } from "../../lib/plans";
import { useAcademyPlan, useCancelPlanRequest, useRequestPlan } from "../../lib/queries";
import { notify } from "../../lib/toast";
import type { AcademyPlan } from "../../lib/types";
import { onMutationError } from "./shared";

/**
 * El plan de la academia en su pantalla de inicio: cuánto cupo lleva usado y
 * cómo pedir uno mayor.
 *
 * Antes la academia no sabía que tenía un tope hasta que una matrícula fallaba
 * al llegar a él, y el plan elegido al registrarse no se veía en ninguna parte.
 * Todavía no hay cobro en línea: la solicitud queda pendiente y el equipo de
 * EDUCA la activa al confirmar el pago.
 */
export function PlanCard() {
  const { data: plan } = useAcademyPlan();
  const cancel = useCancelPlanRequest();
  const [choosing, setChoosing] = useState(false);

  if (!plan) return null;

  const { active_students: used, max_active_students: limit } = plan;
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const barColor = pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-brand-600";
  const current = plan.plans.find((p) => p.code === plan.plan);
  const requested = plan.plans.find((p) => p.code === plan.requested_plan);

  return (
    <Card padding="sm" className="mb-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <SectionHeading className="mb-0">Tu plan</SectionHeading>
          <Badge color="indigo">{plan.plan_name}</Badge>
          {current && Number(current.monthly_price) > 0 && (
            <span className="text-xs text-slate-500">
              {formatQuetzales(Number(current.monthly_price))}/mes
            </span>
          )}
        </div>
        {!requested && (
          <Button variant="secondary" size="sm" onClick={() => setChoosing(true)}>
            Cambiar de plan
          </Button>
        )}
      </div>

      <div className="flex items-baseline justify-between text-xs">
        <span className="text-slate-600">Alumnos activos</span>
        <span className="tabular font-semibold text-slate-900">
          {used} de {limit}
        </span>
      </div>
      <div
        className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100"
        role="progressbar"
        aria-label="Cupo del plan usado"
        aria-valuenow={used}
        aria-valuemin={0}
        aria-valuemax={limit}
      >
        <div className={`h-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      {pct >= 100 ? (
        <p className="mt-2 text-xs text-red-700">
          Llegaste al límite: no podrás matricular a más alumnos hasta pasar a un plan mayor.
        </p>
      ) : pct >= 80 ? (
        <p className="mt-2 text-xs text-amber-700">
          Te quedan {limit - used} plazas. Pide un plan mayor antes de llegar al límite.
        </p>
      ) : null}

      {requested && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-indigo-200 bg-indigo-50/60 p-3 text-xs text-indigo-900">
          <div>
            <span className="font-semibold">Solicitaste el plan {requested.name}</span>
            {plan.plan_requested_at && (
              <span className="text-indigo-700"> · {formatDateTime(plan.plan_requested_at)}</span>
            )}
            <div className="mt-0.5 text-indigo-700">
              Lo activaremos al confirmar el pago de{" "}
              {formatQuetzales(Number(requested.monthly_price))}/mes.
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            disabled={cancel.isPending}
            onClick={() =>
              cancel.mutate(undefined, {
                onSuccess: () => notify("Solicitud cancelada", "success"),
                onError: onMutationError("No se pudo cancelar la solicitud"),
              })
            }
          >
            Cancelar solicitud
          </Button>
        </div>
      )}

      {choosing && <PlanRequestModal plan={plan} onClose={() => setChoosing(false)} />}
    </Card>
  );
}

function PlanRequestModal({ plan, onClose }: { plan: AcademyPlan; onClose: () => void }) {
  const request = useRequestPlan();
  const options = plan.plans.filter((p) => p.code !== plan.plan);
  const fits = (max: number) => max >= plan.active_students;
  const [selected, setSelected] = useState<string | null>(
    options.find((p) => fits(p.max_students) && p.max_students > plan.max_active_students)?.code ??
      null,
  );

  function submit() {
    if (!selected) return;
    request.mutate(selected, {
      onSuccess: () => {
        notify("Solicitud enviada. Te contactaremos para confirmar el pago.", "success");
        onClose();
      },
      onError: onMutationError("No se pudo enviar la solicitud"),
    });
  }

  return (
    <Modal
      title="Cambiar de plan"
      description="Elige el plan que necesitas. Lo activamos en cuanto confirmemos el pago."
      onClose={onClose}
      onSubmit={submit}
      footer={
        <ModalActions hint={`Hoy tienes ${plan.active_students} alumnos activos.`}>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={!selected || request.isPending}>
            {request.isPending ? "Enviando…" : "Solicitar plan"}
          </Button>
        </ModalActions>
      }
    >
      <div className="space-y-2" role="radiogroup" aria-label="Planes">
        {options.map((p) => {
          const ok = fits(p.max_students);
          const active = selected === p.code;
          return (
            <button
              key={p.code}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={!ok}
              onClick={() => setSelected(p.code)}
              className={`flex w-full items-center justify-between rounded-lg border p-3 text-left transition ${
                active
                  ? "border-brand-600 bg-brand-50/70 ring-1 ring-brand-500"
                  : "border-stone-200 bg-white hover:bg-stone-50"
              } disabled:cursor-not-allowed disabled:opacity-50`}
            >
              <div>
                <div className="text-sm font-semibold text-slate-900">{p.name}</div>
                <div className="text-xs text-slate-500">
                  Hasta {p.max_students.toLocaleString("en-US")} alumnos activos
                  {!ok && ` · tienes ${plan.active_students}`}
                </div>
              </div>
              <div className="text-sm font-bold text-slate-900">
                {Number(p.monthly_price) === 0
                  ? "Gratis"
                  : `${formatQuetzales(Number(p.monthly_price))}/mes`}
              </div>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
