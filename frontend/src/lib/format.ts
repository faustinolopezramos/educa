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
  active: "Activo",
  completed: "Completado",
  cancelled: "Cancelado",
};
