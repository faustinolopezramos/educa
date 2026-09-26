import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { api, apiErrorMessage } from "./api";
import { notify } from "./toast";
import type { AttendanceStatus } from "./types";

/**
 * Las marcas de asistencia de una clase, a salvo de una mala conexión.
 *
 * En el aula el profesor pasa lista con el móvil, y la wifi del edificio no es
 * de fiar. Antes, una marca que no llegaba al servidor se perdía tras un aviso
 * que nadie lee a mitad de clase. Ahora cada toque:
 *
 * 1. se ve al instante (la fila no espera al servidor),
 * 2. se guarda en el teléfono (sobrevive a recargar o a que el navegador mate
 *    la pestaña),
 * 3. y se envía en lote —un toque rápido tras otro viaja en una sola
 *    petición— reintentando solo mientras el fallo sea de red.
 *
 * Un rechazo del servidor (lista cerrada, matrícula dada de baja) no se
 * reintenta: se descarta y se dice por qué.
 */

export type PendingMarks = Record<number, AttendanceStatus>;

const STORAGE_PREFIX = "educa:attendance-queue:";
/** Una cola más vieja que esto es de otra jornada: mejor no enviarla a ciegas. */
const MAX_AGE_MS = 12 * 60 * 60 * 1000;
const RETRY_DELAYS_MS = [2_000, 5_000, 10_000, 20_000];
/** Agrupa los toques seguidos en una sola petición. */
const DEBOUNCE_MS = 400;
const REQUEST_TIMEOUT_MS = 10_000;

/** Un fallo que se arregla reintentando: sin respuesta, 5xx, 408 o 429. */
export function isTransientError(error: unknown): boolean {
  const status = (error as { response?: { status?: number } })?.response?.status;
  if (status === undefined) return true;
  return status >= 500 || status === 408 || status === 429;
}

export function loadPending(sessionId: number, now = Date.now()): PendingMarks {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + sessionId);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as { savedAt?: number; marks?: PendingMarks };
    if (!parsed.savedAt || now - parsed.savedAt > MAX_AGE_MS) {
      localStorage.removeItem(STORAGE_PREFIX + sessionId);
      return {};
    }
    return parsed.marks ?? {};
  } catch {
    return {};
  }
}

export function savePending(sessionId: number, marks: PendingMarks, now = Date.now()): void {
  try {
    if (Object.keys(marks).length === 0) {
      localStorage.removeItem(STORAGE_PREFIX + sessionId);
    } else {
      localStorage.setItem(STORAGE_PREFIX + sessionId, JSON.stringify({ savedAt: now, marks }));
    }
  } catch {
    // Sin almacenamiento (modo privado, cuota llena): la cola sigue en memoria.
  }
}

/** Quita de `current` lo que se envió, salvo lo que se volvió a tocar mientras tanto. */
export function withoutSent(current: PendingMarks, sent: PendingMarks): PendingMarks {
  const next = { ...current };
  for (const [id, status] of Object.entries(sent)) {
    if (next[Number(id)] === status) delete next[Number(id)];
  }
  return next;
}

export function useAttendanceQueue(sessionId: number) {
  const qc = useQueryClient();
  const [pending, setPending] = useState<PendingMarks>(() => loadPending(sessionId));
  const [offline, setOffline] = useState(false);
  const [sending, setSending] = useState(false);

  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  const inFlight = useRef(false);
  const attempt = useRef(0);
  // Dos temporizadores distintos: la limpieza del de agrupación (que corre en
  // cada cambio de la cola) no debe cancelar un reintento ya programado.
  const debounceTimer = useRef<number | undefined>(undefined);
  const retryTimer = useRef<number | undefined>(undefined);

  useEffect(() => savePending(sessionId, pending), [sessionId, pending]);

  const refresh = useCallback(() => {
    for (const key of ["class-board", "attendance", "report", "dashboard", "sessions", "agenda"]) {
      qc.invalidateQueries({ queryKey: [key] });
    }
  }, [qc]);

  const flush = useCallback(async () => {
    window.clearTimeout(debounceTimer.current);
    window.clearTimeout(retryTimer.current);
    if (inFlight.current) return;
    const batch = { ...pendingRef.current };
    const items = Object.entries(batch).map(([id, status]) => ({
      enrollment_id: Number(id),
      status,
    }));
    if (items.length === 0) return;

    inFlight.current = true;
    setSending(true);
    try {
      await api.post(
        `/attendance/sessions/${sessionId}/bulk`,
        { items },
        { timeout: REQUEST_TIMEOUT_MS },
      );
      attempt.current = 0;
      setOffline(false);
      setPending((cur) => withoutSent(cur, batch));
      refresh();
    } catch (error) {
      if (isTransientError(error)) {
        setOffline(true);
        const delay = RETRY_DELAYS_MS[Math.min(attempt.current, RETRY_DELAYS_MS.length - 1)];
        attempt.current += 1;
        retryTimer.current = window.setTimeout(() => void flush(), delay);
      } else {
        attempt.current = 0;
        setOffline(false);
        setPending((cur) => withoutSent(cur, batch));
        notify(apiErrorMessage(error, "El servidor rechazó las marcas"), "error");
        refresh();
      }
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  }, [sessionId, refresh]);

  // Cada cambio en la cola se envía tras una pausa corta; si hay un reintento
  // programado por un fallo de red, se respeta su espera.
  useEffect(() => {
    if (Object.keys(pending).length === 0 || inFlight.current) return;
    if (attempt.current > 0) return;
    debounceTimer.current = window.setTimeout(() => void flush(), DEBOUNCE_MS);
    return () => window.clearTimeout(debounceTimer.current);
  }, [pending, flush, sending]);

  // Vuelve la conexión: no esperar al siguiente reintento.
  useEffect(() => {
    const onOnline = () => {
      attempt.current = 0;
      void flush();
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [flush]);

  // Salir de la página con marcas sin enviar: el navegador pregunta. (Quedan
  // guardadas igualmente y se envían al volver a abrir la clase.)
  const count = Object.keys(pending).length;
  useEffect(() => {
    if (count === 0) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [count]);

  useEffect(
    () => () => {
      window.clearTimeout(debounceTimer.current);
      window.clearTimeout(retryTimer.current);
    },
    [],
  );

  const mark = useCallback((enrollmentId: number, status: AttendanceStatus) => {
    setPending((cur) => ({ ...cur, [enrollmentId]: status }));
  }, []);

  const markMany = useCallback((enrollmentIds: number[], status: AttendanceStatus) => {
    setPending((cur) => {
      const next = { ...cur };
      for (const id of enrollmentIds) next[id] = status;
      return next;
    });
  }, []);

  return { pending, count, offline, sending, mark, markMany, flush };
}
