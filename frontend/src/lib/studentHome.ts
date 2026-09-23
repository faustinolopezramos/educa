/**
 * Cómo se lee la portada del alumno en una frase.
 *
 * Vive aquí, y no en la pantalla, para poder fijar con una prueba qué dice
 * exactamente cada situación: en curso, a minutos, en horas, o sin clases.
 */

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

/** La frase bajo "Hola, {nombre}": qué sigue, en el lenguaje del alumno. */
export function nextClassStatusLine(startMs: number | null, nowMs: number): string {
  if (startMs == null) return "Hoy no tienes clases.";
  const remaining = startMs - nowMs;
  if (remaining <= 0) return "Tu clase está en curso.";
  if (remaining < HOUR_MS) {
    const minutes = Math.max(1, Math.round(remaining / MINUTE_MS));
    return minutes === 1
      ? "Tu próxima clase es en 1 minuto."
      : `Tu próxima clase es en ${minutes} minutos.`;
  }
  const hours = Math.round(remaining / HOUR_MS);
  return hours === 1
    ? "Tu próxima clase es en 1 hora."
    : `Tu próxima clase es en ${hours} horas.`;
}
