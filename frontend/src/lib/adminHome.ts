import type { ActionItem } from "./types";

/**
 * Cómo se lee "Resumen" en una frase.
 *
 * `ActionTray` ya lista cada pendiente como una fila con la que se puede
 * actuar; esto es la versión de un vistazo, la misma idea que ya usan la
 * jornada del profesor y la semana del alumno. Vive aparte para poder fijar
 * con una prueba qué dice exactamente cada combinación de pendientes.
 */
export function adminStatusLine(items: ActionItem[]): string {
  if (items.length === 0) return "Todo al día esta semana.";

  const phrases = items.map((item) => `${item.count} ${item.label}`);
  if (phrases.length === 1) return `${phrases[0]}.`;
  if (phrases.length === 2) return `${phrases[0]} y ${phrases[1]}.`;

  const [first, second] = phrases;
  const rest = phrases.length - 2;
  return `${first}, ${second} y ${rest === 1 ? "un pendiente más" : `${rest} pendientes más`}.`;
}
