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
