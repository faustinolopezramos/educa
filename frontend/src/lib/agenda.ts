import type { AgendaEntry } from "./types";

/**
 * La jornada de un profesor, leída como tiempo.
 *
 * Vive aquí y no dentro de la pantalla porque son las reglas que deciden qué ve
 * el profesor al abrir el sistema —qué clase está en curso, cuál dejó a medias,
 * qué hueco merece mencionarse— y eso se prueba mejor sin montar la interfaz.
 */

const HOUR = 60;

/** Minutos desde medianoche de un "HH:MM[:SS]". */
export function minutesOf(hhmmss: string): number {
  const [h, m] = hhmmss.split(":");
  return Number(h) * HOUR + Number(m);
}

/**
 * Cómo se nombra el hueco entre dos clases, o `null` si no hay hueco que
 * nombrar: por debajo de tres cuartos de hora son dos clases seguidas con el
 * tiempo justo de cambiar de aula, y anunciarlo sólo añade ruido al día.
 */
export function gapLabel(minutes: number): string | null {
  if (minutes < 45) return null;
  const hours = Math.round(minutes / HOUR);
  if (hours <= 1) return "una hora sin clase";
  return `${hours} horas sin clase`;
}

/**
 * El estado de una clase dentro del día:
 *
 * - `live`: está ocurriendo ahora.
 * - `next`: todavía no empieza.
 * - `open`: ya terminó y su lista sigue abierta — trabajo pendiente, no historia.
 * - `done`: cerrada o cancelada; no pide nada.
 */
export type ClassPhase = "done" | "live" | "next" | "open";

export function phaseOf(entry: AgendaEntry, nowMinutes: number): ClassPhase {
  if (entry.status === "cancelled") return "done";
  if (entry.register_closed) return "done";
  const start = minutesOf(entry.start_time);
  const end = minutesOf(entry.end_time);
  if (nowMinutes >= start && nowMinutes <= end) return "live";
  if (nowMinutes > end) return "open";
  return "next";
}

/** Minutos desde medianoche de la hora local actual. */
export function nowMinutes(at = new Date()): number {
  return at.getHours() * HOUR + at.getMinutes();
}

/** Cuánto de la clase ha transcurrido, en porcentaje, acotado a [0, 100]. */
export function elapsedPct(entry: AgendaEntry, now: number): number {
  const start = minutesOf(entry.start_time);
  const end = minutesOf(entry.end_time);
  if (end <= start) return 0;
  return Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100));
}

/** Cuántas horas dura la clase, con un decimal. */
export function durationHours(entry: AgendaEntry): number {
  return Math.round(((minutesOf(entry.end_time) - minutesOf(entry.start_time)) / HOUR) * 10) / 10;
}
