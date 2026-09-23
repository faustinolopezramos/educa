import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { Button, Card, EmptyState, PageHeader } from "../../components/ui";
import { IconCalendar, IconCheck, IconVideo } from "../../components/icons";
import { useAgenda, useEnsureSession } from "../../lib/queries";
import { apiErrorMessage } from "../../lib/api";
import { formatTime, modalityLabel, needsLink, todayLocal } from "../../lib/format";
import {
  durationHours,
  elapsedPct,
  gapLabel,
  minutesOf,
  nowMinutes,
  phaseOf,
  type ClassPhase,
} from "../../lib/agenda";
import { notify } from "../../lib/toast";
import type { AgendaEntry } from "../../lib/types";

/**
 * La jornada del profesor.
 *
 * El eje es la hora, no la entidad: la pantalla anterior pedía elegir un
 * horario de una lista y después una sesión dentro de él antes de poder marcar
 * a nadie, aunque la clase que el profesor quiere es casi siempre la que tiene
 * delante. Aquí el día se dibuja como lo que es —tres bloques con huecos entre
 * ellos— y cada clase lleva la única acción que le toca ahora.
 *
 * Las horas vacías se pliegan en una línea ("tres horas sin clase") en vez de
 * ocupar pantalla, y una marca señala la hora actual dentro del día.
 */

export function TodayView() {
  const [, setParams] = useSearchParams();
  const today = todayLocal();
  const { data: agenda = [], isLoading } = useAgenda();

  // El reloj avanza aunque nadie toque la pantalla: una clase empieza, otra
  // termina y su lista pasa a estar pendiente. Sin esto había que recargar para
  // que la jornada dijera la verdad.
  const [minutes, setMinutes] = useState(() => nowMinutes());
  useEffect(() => {
    const id = window.setInterval(() => setMinutes(nowMinutes()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  const classes = useMemo(
    () =>
      [...agenda].sort((a, b) => a.start_time.localeCompare(b.start_time)),
    [agenda],
  );

  const pending = classes.filter((c) => phaseOf(c, minutes) === "open").length;
  const live = classes.find((c) => phaseOf(c, minutes) === "live");

  const description = (() => {
    if (classes.length === 0) return "Hoy no tienes clases.";
    const count =
      classes.length === 1 ? "Una clase hoy" : `${classes.length} clases hoy`;
    if (pending === 0) return `${count}.`;
    return pending === 1
      ? `${count}. Una lista sigue abierta.`
      : `${count}. ${pending} listas siguen abiertas.`;
  })();

  return (
    <div className="space-y-6">
      <PageHeader
        title={new Date().toLocaleDateString("es", {
          weekday: "long",
          day: "numeric",
          month: "long",
        })}
        description={description}
        actions={
          <Button variant="secondary" onClick={() => setParams({ m: "clases" })}>
            Mis clases
          </Button>
        }
      />

      {isLoading ? (
        <Card>
          <p className="py-8 text-center text-xs text-slate-500">Cargando tu jornada…</p>
        </Card>
      ) : classes.length === 0 ? (
        <Card>
          <EmptyState
            icon={<IconCalendar className="h-5 w-5" />}
            title="Hoy no tienes clases"
            message="Cuando tengas una clase programada aparecerá aquí, con la lista lista para pasar."
            action={
              <Button variant="secondary" onClick={() => setParams({ m: "clases" })}>
                Ver todas mis clases
              </Button>
            }
          />
        </Card>
      ) : (
        <ol className="space-y-1">
          {classes.map((entry, i) => {
            const previous = classes[i - 1];
            const gap = previous
              ? gapLabel(minutesOf(entry.start_time) - minutesOf(previous.end_time))
              : null;
            return (
              <li key={entry.session_id}>
                {gap && <Gap label={gap} />}
                <ClassBlock
                  entry={entry}
                  phase={phaseOf(entry, minutes)}
                  minutes={minutes}
                  today={today}
                />
              </li>
            );
          })}
        </ol>
      )}

      {!isLoading && classes.length > 0 && !live && pending === 0 && (
        <p className="text-xs text-slate-500">
          Todas las listas de hoy están cerradas.
        </p>
      )}
    </div>
  );
}

function Gap({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-5 py-1.5 pl-[5.5rem]">
      <span className="h-px w-8 bg-slate-300" />
      <span className="text-xs text-slate-500">{label}</span>
    </div>
  );
}

function ClassBlock({
  entry,
  phase,
  minutes,
  today,
}: {
  entry: AgendaEntry;
  phase: ClassPhase;
  minutes: number;
  today: string;
}) {
  const navigate = useNavigate();
  const ensure = useEnsureSession();

  const cancelled = entry.status === "cancelled";
  // Dónde cae "ahora" dentro de la clase, para colocar la marca de la hora.
  const progress = elapsedPct(entry, minutes);

  const place = [
    modalityLabel(entry.modality),
    entry.room_name ?? (needsLink(entry.modality) ? "enlace" : null),
  ]
    .filter(Boolean)
    .join(" · ");

  const counts = `${entry.students_marked} de ${entry.students_total} marcados`;

  function openLobby() {
    ensure.mutate(
      { schedule_id: entry.schedule_id, date: today },
      {
        onSuccess: (session) => navigate(`/lobby/${session.id}`),
        onError: (e) => notify(apiErrorMessage(e, "No se pudo abrir el aula"), "error"),
      },
    );
  }

  if (phase === "live") {
    return (
      <div className="flex gap-5">
        <TimeColumn entry={entry} strong />
        <div className="relative flex-1 overflow-hidden rounded-2xl bg-slate-900 px-6 py-5 text-slate-100">
          <span
            className="absolute left-0 h-0.5 bg-brand-500"
            style={{ top: `${progress}%`, width: "100%" }}
            aria-hidden
          />
          <div className="relative flex flex-wrap items-center gap-x-5 gap-y-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2.5">
                <h2 className="truncate text-xl font-bold text-white">
                  {entry.course_name}
                </h2>
                <span className="flex-none rounded-full bg-brand-500 px-2.5 py-1 text-2xs font-bold text-white">
                  En curso
                </span>
              </div>
              <p className="tabular mt-1 text-sm text-slate-300">
                {place} · {counts}
                {entry.makeup_visitors > 0 &&
                  ` · ${entry.makeup_visitors} en recuperación`}
              </p>
            </div>
            <div className="flex flex-none flex-wrap gap-2.5">
              {needsLink(entry.modality) && (
                <Button
                  variant="secondary"
                  className="border-slate-600 bg-transparent text-slate-100 hover:bg-slate-800"
                  disabled={ensure.isPending}
                  onClick={openLobby}
                >
                  {ensure.isPending ? "Abriendo…" : "Entrar al aula"}
                </Button>
              )}
              <Button onClick={() => navigate(`/clase/${entry.session_id}`)}>
                Pasar lista
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const accent =
    phase === "open"
      ? "border-l-[3px] border-l-amber-500"
      : phase === "next"
        ? "border-l-[3px] border-l-brand-500"
        : "";

  return (
    <div className="flex gap-5">
      <TimeColumn entry={entry} />
      <div
        className={`flex flex-1 flex-wrap items-center gap-x-5 gap-y-3 rounded-xl border border-slate-200 bg-white px-5 py-4 ${accent} ${
          phase === "done" ? "opacity-80" : ""
        }`}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="truncate text-base font-semibold text-slate-800">
              {entry.course_name}
            </h2>
            {entry.register_closed && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-2xs font-semibold text-emerald-700">
                <IconCheck className="h-3 w-3" />
                Lista cerrada
              </span>
            )}
            {phase === "open" && (
              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-2xs font-semibold text-amber-700">
                Lista sin cerrar
              </span>
            )}
            {cancelled && (
              <span className="rounded-full bg-red-50 px-2.5 py-1 text-2xs font-semibold text-red-700">
                Cancelada
              </span>
            )}
            {entry.makeup_visitors > 0 && !cancelled && (
              <span className="rounded-full bg-brand-50 px-2.5 py-1 text-2xs font-semibold text-brand-700">
                {entry.makeup_visitors} en recuperación
              </span>
            )}
          </div>
          <p className="tabular mt-1 text-xs text-slate-600">
            {place}
            {!cancelled && ` · ${counts}`}
          </p>
        </div>
        <div className="flex flex-none gap-2.5">
          {!cancelled && needsLink(entry.modality) && phase === "next" && (
            <Button
              variant="secondary"
              disabled={ensure.isPending}
              onClick={openLobby}
              aria-label={`Entrar al aula de ${entry.course_name}`}
            >
              <IconVideo className="h-4 w-4" />
            </Button>
          )}
          <Button
            variant={phase === "open" ? "primary" : "secondary"}
            onClick={() => navigate(`/clase/${entry.session_id}`)}
          >
            {phase === "open"
              ? "Terminar la lista"
              : entry.register_closed
                ? "Ver lista"
                : "Preparar"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function TimeColumn({ entry, strong }: { entry: AgendaEntry; strong?: boolean }) {
  const hours = durationHours(entry);
  return (
    <div className="flex-none pt-5 text-right" style={{ width: "4.5rem" }}>
      <div
        className={`tabular text-base font-semibold ${
          strong ? "text-brand-600" : "text-slate-700"
        }`}
      >
        {formatTime(entry.start_time)}
      </div>
      <div className="text-2xs text-slate-500">{hours} h</div>
    </div>
  );
}
