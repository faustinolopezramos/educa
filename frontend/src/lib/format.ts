import type { Modality } from "./types";

export const DAYS = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
];

export function dayName(dow: number): string {
  return DAYS[dow] ?? `Día ${dow}`;
}

/** El día de hoy como Lunes=0..Domingo=6, la convención de `Schedule.day_of_week`.
 *  Vivía copiada igual en tres pantallas; una sola versión no puede divergir. */
export function localDow(d = new Date()): number {
  return (d.getDay() + 6) % 7;
}

export function formatDateTime(iso: string, timeZone?: string): string {
  return new Date(iso).toLocaleString("es", {
    dateStyle: "medium",
    timeStyle: "short",
    ...(timeZone ? { timeZone } : {}),
  });
}

export function formatTime(hhmmss: string): string {
  // "09:00:00" -> "09:00"
  return hhmmss.slice(0, 5);
}

/** Today as "YYYY-MM-DD" in the viewer's own timezone.
 *
 * Not `toISOString().slice(0, 10)`: that is the UTC day, which for anyone west
 * of Greenwich rolls over during the evening — an 8pm class in Mexico City
 * would have its attendance filed under tomorrow.
 */
export function todayLocal(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * "2026-09-21" → "lun 21 sept": a class date as a person reads it.
 *
 * The date-only string is read as a calendar day in local time — `new
 * Date("2026-09-21")` would parse it as UTC midnight and show the day before
 * anywhere west of Greenwich.
 */
export function shortDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return ymd;
  return new Date(y, m - 1, d)
    .toLocaleDateString("es", { weekday: "short", day: "numeric", month: "short" })
    .replace(/\./g, "")
    .replace(",", "");
}

export function calculateEndDate(startDateStr: string, periodicity: string): string {
  if (!startDateStr || !/^\d{4}-\d{2}-\d{2}$/.test(startDateStr)) return "";

  const [yearStr, monthStr, dayStr] = startDateStr.split("-");
  let year = parseInt(yearStr, 10);
  let month = parseInt(monthStr, 10);
  let day = parseInt(dayStr, 10);

  let monthsToAdd = 0;
  if (periodicity === "mensual") monthsToAdd = 1;
  else if (periodicity === "bimensual") monthsToAdd = 2;
  else if (periodicity === "trimestral") monthsToAdd = 3;
  else if (periodicity === "cuatrimestral") monthsToAdd = 4;
  else if (periodicity === "semestral") monthsToAdd = 6;
  else if (periodicity === "anual") monthsToAdd = 12;
  else return "";

  month += monthsToAdd;
  while (month > 12) {
    month -= 12;
    year += 1;
  }

  const maxDaysInNewMonth = new Date(year, month, 0).getDate();
  if (day > maxDaysInNewMonth) {
    day = maxDaysInNewMonth;
  }

  const yyyy = String(year).padStart(4, "0");
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");

  return `${yyyy}-${mm}-${dd}`;
}

// Short label of the timezone as seen at `iso`, e.g. "GMT-6".
export function timeZoneLabel(iso: string, timeZone?: string): string {
  try {
    const parts = new Intl.DateTimeFormat("es", {
      timeZone,
      timeZoneName: "short",
    }).formatToParts(new Date(iso));
    return parts.find((p) => p.type === "timeZoneName")?.value ?? "";
  } catch {
    return "";
  }
}

// Human-readable Spanish labels for backend enums.
export const PAYMENT_LABELS: Record<string, string> = {
  pending: "Pendiente",
  paid: "Pagado",
  overdue: "Vencido",
};

export const ENROLLMENT_LABELS: Record<string, string> = {
  enrolled: "Inscrito",
  active: "Activo",
  inactive: "Inactivo",
  graduated: "Graduado",
  withdrawn: "Desistió",
};

/**
 * The three ways a class can be held.
 *
 * Every screen used to write this out as `modality === "virtual" ? "Virtual" :
 * "Presencial"`, which silently folded **Semi presencial** into "Presencial" —
 * so the third modality the academy actually offers was invisible everywhere it
 * mattered: the teacher's class list, the planner, the course sheet and the
 * approval queue all called a hybrid class presencial.
 */
export const MODALITY_LABELS: Record<Modality, string> = {
  presencial: "Presencial",
  semi_presencial: "Semi presencial",
  virtual: "Virtual",
};

export function modalityLabel(modality: Modality): string {
  return MODALITY_LABELS[modality] ?? modality;
}

/** Badge colour per modality, so the three are told apart at a glance. */
export function modalityColor(
  modality: Modality | "mixta",
): "indigo" | "sky" | "slate" | "amber" {
  if (modality === "virtual") return "indigo";
  if (modality === "semi_presencial") return "sky";
  // Un curso cuyas franjas no coinciden merece un color propio: no es ninguna
  // de las tres, y pintarlo como presencial lo diría mal.
  if (modality === "mixta") return "amber";
  return "slate";
}

/** True when the class puts people in a room — presencial *and* semi
 *  presencial both reserve one, which is why a room check must not test for
 *  `=== "presencial"`. */
export function usesRoom(modality: Modality): boolean {
  return modality !== "virtual";
}

/**
 * True when the class needs a connection link.
 *
 * Espeja `MODALITY_NEEDS_LINK` de la API. La pareja de `usesRoom`, y la que
 * faltaba: media docena de sitios preguntaban `=== "virtual"` para decidir si
 * mostrar un enlace, de modo que una clase **semi presencial** —que se da en el
 * aula *y* en línea— nunca enseñaba el suyo. El backend, además, lo borraba al
 * guardarlo, así que ni siquiera existía.
 */
export function needsLink(modality: Modality): boolean {
  return modality !== "presencial";
}

/**
 * La modalidad **del curso**, deducida de sus franjas.
 *
 * La modalidad vive en el horario, no en el curso, porque es la franja la que
 * ocupa un aula concreta a una hora concreta. Un curso, sin embargo, sí tiene
 * una respuesta que dar a "¿esto es presencial o en línea?", y es la de sus
 * franjas cuando todas coinciden.
 *
 * Se deduce en lugar de guardarse aparte para que no puedan discrepar: un campo
 * `Course.modality` diciendo "virtual" mientras una de sus franjas reserva aula
 * sería exactamente la clase de doble verdad que este código viene evitando.
 *
 * `null` = el curso no tiene franjas todavía. `"mixta"` = las tiene, y no todas
 * en la misma modalidad, que es información y no un error.
 */
export function courseModality(
  schedules: { modality: Modality }[],
): Modality | "mixta" | null {
  if (schedules.length === 0) return null;
  const first = schedules[0].modality;
  return schedules.every((s) => s.modality === first) ? first : "mixta";
}

/** Etiqueta para lo que devuelve `courseModality`, incluida la mixta. */
export function courseModalityLabel(value: Modality | "mixta"): string {
  return value === "mixta" ? "Modalidad mixta" : MODALITY_LABELS[value];
}

/** Dónde se da la clase, en una línea, para quien sólo necesita saber adónde ir. */
export function locationSummary(
  modality: Modality,
  roomName: string | null,
): string {
  if (modality === "virtual") return "Aula virtual";
  const room = roomName ?? "aula por asignar";
  return modality === "semi_presencial"
    ? `${MODALITY_LABELS.semi_presencial} · ${room}`
    : room;
}
