/**
 * Cómo se lee la portada del alumno en una frase.
 *
 * Vive aquí, y no en la pantalla, para poder fijar con una prueba qué dice
 * exactamente cada situación: en curso, a minutos, en horas, o sin clases.
 */

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

/** La frase bajo "Hola, {nombre}": qué sigue, en el lenguaje del alumno.
 *
 * Pasada la hora, ya no cuenta horas: «es en 60 horas» obliga a hacer la
 * cuenta para saber que es el lunes. Dice el día y la hora de la clase, que es
 * como se piensa en ella.
 */
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
  return `Tu próxima clase es ${whenLabel(startMs, nowMs)}.`;
}

const DAY_MS = 24 * HOUR_MS;

/** "hoy a las 14:00", "mañana a las 08:00", "el lunes a las 08:00", "el 12 de octubre a las 08:00". */
export function whenLabel(startMs: number, nowMs: number): string {
  const start = new Date(startMs);
  const time = start.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit", hour12: false });
  const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
  const now = new Date(nowMs);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const days = Math.round((startDay - today) / DAY_MS);

  if (days <= 0) return `hoy a las ${time}`;
  if (days === 1) return `mañana a las ${time}`;
  if (days < 7) {
    return `el ${start.toLocaleDateString("es", { weekday: "long" })} a las ${time}`;
  }
  return `el ${start.toLocaleDateString("es", { day: "numeric", month: "long" })} a las ${time}`;
}
