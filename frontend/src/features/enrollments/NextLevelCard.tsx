import { useState } from "react";

import { Badge, Button, Modal, ModalActions } from "../../components/ui";
import { IconLock } from "../../components/icons";
import { apiErrorMessage } from "../../lib/api";
import { DAYS, formatTime, modalityLabel } from "../../lib/format";
import { useRenewalOptions, useRequestRenewal, useWithdrawRenewal } from "../../lib/queries";
import { notify } from "../../lib/toast";
import type { RenewalCourseOption, RenewalOption } from "../../lib/types";

/**
 * "Tu siguiente nivel", en el inicio del alumno que acaba de graduarse.
 *
 * Seguir en A2 después de A1 dependía de que alguien en recepción se acordara
 * de ofrecerlo. Aquí el alumno ve los grupos abiertos del nivel siguiente con
 * su horario y su cupo, y pide plaza en uno con dos toques. Pedir no es
 * matricularse: dirección confirma, y hasta entonces no hay cupo tomado ni
 * cuota cargada — la tarjeta lo dice para que nadie crea que ya está dentro.
 *
 * No aparece mientras no haya nada que ofrecer: un alumno a mitad de curso no
 * necesita que le hablen del siguiente.
 */
export function NextLevelCard() {
  const { data } = useRenewalOptions();
  if (!data || data.options.length === 0) return null;

  return (
    <>
      {data.options.map((option) => (
        <NextLevelOption
          key={option.from_enrollment_id}
          option={option}
          blocked={data.blocked_reason === "delinquent"}
        />
      ))}
    </>
  );
}

function NextLevelOption({ option, blocked }: { option: RenewalOption; blocked: boolean }) {
  const [choosing, setChoosing] = useState<RenewalCourseOption | null>(null);
  const withdraw = useWithdrawRenewal();
  const request = option.request;
  const pending = request?.status === "pending";

  return (
    <section className="mb-6 rounded-2xl border border-brand-200/80 bg-gradient-to-r from-brand-50/70 via-white to-white p-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-brand-700">
        Tu siguiente nivel
      </p>
      <h2 className="mt-1 text-lg font-bold tracking-tight text-slate-900">
        {option.next_level_name}
      </h2>
      <p className="mt-0.5 text-sm text-slate-600">
        Terminaste {option.from_course_name}.{" "}
        {pending
          ? "Tu solicitud está enviada."
          : "Elige tu grupo y dirección confirmará tu plaza."}
      </p>

      {pending ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3.5">
          <div className="min-w-0 text-sm">
            <p className="font-semibold text-slate-900">{request.course_name}</p>
            <p className="text-xs text-slate-500">
              Esperando confirmación de dirección. Te avisaremos en cuanto la revisen.
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            disabled={withdraw.isPending}
            onClick={() =>
              withdraw.mutate(request.id, {
                onSuccess: () => notify("Solicitud cancelada", "success"),
                onError: (e) => notify(apiErrorMessage(e, "No se pudo cancelar"), "error"),
              })
            }
          >
            Cancelar solicitud
          </Button>
        </div>
      ) : blocked ? (
        <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-sm text-amber-900">
          <IconLock className="mt-0.5 h-4 w-4 flex-none text-amber-700" />
          Ponte al día con tus pagos para pedir plaza en el siguiente nivel.
        </div>
      ) : (
        <>
          {request?.status === "rejected" && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-sm text-amber-900">
              Tu solicitud para <strong>{request.course_name}</strong> no pudo aceptarse
              {request.review_note ? `: ${request.review_note}` : "."} Puedes elegir otro grupo.
            </div>
          )}
          {option.courses.length === 0 ? (
            <p className="mt-4 rounded-xl border border-slate-200 bg-white p-3.5 text-sm text-slate-600">
              Todavía no hay grupos abiertos de este nivel. Pregunta en recepción cuándo abren
              el próximo.
            </p>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {option.courses.map((course) => (
                <GroupTile key={course.id} course={course} onChoose={() => setChoosing(course)} />
              ))}
            </div>
          )}
        </>
      )}

      {choosing && (
        <ConfirmRequest option={option} course={choosing} onClose={() => setChoosing(null)} />
      )}
    </section>
  );
}

function GroupTile({
  course,
  onChoose,
}: {
  course: RenewalCourseOption;
  onChoose: () => void;
}) {
  const full = course.seats_left === 0;
  const unavailable = full || course.clashes;

  return (
    <div className="flex flex-col rounded-xl border border-slate-200 bg-white p-3.5">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 text-sm font-semibold text-slate-900">{course.name}</p>
        {full ? (
          <Badge color="slate">Sin cupo</Badge>
        ) : course.seats_left <= 3 ? (
          <Badge color="amber">
            {course.seats_left === 1 ? "Queda 1 plaza" : `Quedan ${course.seats_left} plazas`}
          </Badge>
        ) : null}
      </div>
      {course.start_date && (
        <p className="mt-0.5 text-xs text-slate-500">Empieza el {longDate(course.start_date)}</p>
      )}
      <ul className="mt-2 space-y-0.5 text-xs text-slate-700">
        {course.schedules.map((s, i) => (
          <li key={i} className="tabular">
            {DAYS[s.day_of_week]} {formatTime(s.start_time)}–{formatTime(s.end_time)} ·{" "}
            {modalityLabel(s.modality)}
          </li>
        ))}
      </ul>
      {course.clashes && (
        <p className="mt-2 text-xs font-medium text-red-700">Choca con otra de tus clases</p>
      )}
      <div className="mt-auto pt-3">
        <Button size="sm" className="w-full" disabled={unavailable} onClick={onChoose}>
          Pedir plaza
        </Button>
      </div>
    </div>
  );
}

function ConfirmRequest({
  option,
  course,
  onClose,
}: {
  option: RenewalOption;
  course: RenewalCourseOption;
  onClose: () => void;
}) {
  const ask = useRequestRenewal();

  function submit() {
    ask.mutate(
      { from_enrollment_id: option.from_enrollment_id, course_id: course.id },
      {
        onSuccess: () => {
          notify("¡Solicitud enviada! Te avisaremos cuando dirección la confirme.", "success");
          onClose();
        },
        onError: (e) => notify(apiErrorMessage(e, "No se pudo enviar la solicitud"), "error"),
      },
    );
  }

  return (
    <Modal
      title={`Pedir plaza en ${course.name}`}
      onClose={onClose}
      maxWidth="max-w-sm"
      footer={
        <ModalActions>
          <Button variant="secondary" onClick={onClose}>
            Volver
          </Button>
          <Button disabled={ask.isPending} onClick={submit}>
            {ask.isPending ? "Enviando…" : "Enviar solicitud"}
          </Button>
        </ModalActions>
      }
    >
      <div className="space-y-2 text-sm leading-relaxed text-slate-600">
        <p>
          Dirección revisará tu solicitud y te confirmará la plaza. Hasta entonces no se te
          cobra nada.
        </p>
        {option.amount > 0 && (
          <p>
            Cuota: <strong className="tabular text-slate-900">Q{option.amount.toFixed(2)}</strong>, la
            misma de tu nivel anterior
            {course.start_date ? `, con vencimiento el ${longDate(course.start_date)}` : ""}.
          </p>
        )}
      </div>
    </Modal>
  );
}

/** "2026-10-12" → "12 de octubre". A date-only string, read as a calendar day. */
function longDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es", { day: "numeric", month: "long" });
}
