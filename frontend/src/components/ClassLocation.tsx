import { needsLink, usesRoom } from "../lib/format";
import type { Modality } from "../lib/types";

/**
 * Dónde se da una clase, con **todas** las mitades que su modalidad tiene.
 *
 * Existe porque dos pantallas de dirección —la cola de aprobación y el modal de
 * pendientes— resolvían esto con `modality === "virtual" ? enlace : aula`. Para
 * una clase **semi presencial** eso mostraba sólo el aula, así que quien
 * aprobaba la propuesta no veía el enlace que estaba aprobando.
 */
export function ClassLocation({
  modality,
  roomName,
  joinUrl,
  compact,
}: {
  modality: Modality;
  roomName: string | null;
  joinUrl: string | null;
  /** Trunca el enlace, para celdas de tabla estrechas. */
  compact?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      {usesRoom(modality) && (
        <span className="font-medium text-slate-700">
          {roomName ?? (
            <span className="text-amber-700">Aula sin asignar</span>
          )}
        </span>
      )}
      {needsLink(modality) &&
        (joinUrl ? (
          <a
            href={joinUrl}
            target="_blank"
            rel="noreferrer"
            className={`text-brand-600 hover:underline ${
              compact ? "inline-block max-w-[180px] truncate font-mono text-xs" : ""
            }`}
          >
            {joinUrl}
          </a>
        ) : (
          <span className="text-xs text-amber-700">Enlace no indicado</span>
        ))}
    </div>
  );
}
