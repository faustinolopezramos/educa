/** Jornada/Plan presets: predefined day+time combinations the business
 * offers, on top of the free-form day/hour picker `Schedule` already
 * supports. Picking one just fills in one or more day_of_week/start_time/
 * end_time slots.
 */
export interface JornadaPreset {
  label: string;
  category: "semana" | "sabado" | "domingo" | "nocturna";
  durationHours: number;
  /** One entry per class day this jornada meets. */
  slots: { day_of_week: number; start_time: string; end_time: string }[];
}

// day_of_week: 0=Monday .. 6=Sunday.
export const JORNADA_PRESETS: JornadaPreset[] = [
  // Entre semana (Lunes a Viernes - 1 hora diaria)
  {
    label: "Diaria Lunes a Viernes · Mañana (08:00–09:00 · 1h/día)",
    category: "semana",
    durationHours: 1,
    slots: [
      { day_of_week: 0, start_time: "08:00:00", end_time: "09:00:00" },
      { day_of_week: 1, start_time: "08:00:00", end_time: "09:00:00" },
      { day_of_week: 2, start_time: "08:00:00", end_time: "09:00:00" },
      { day_of_week: 3, start_time: "08:00:00", end_time: "09:00:00" },
      { day_of_week: 4, start_time: "08:00:00", end_time: "09:00:00" },
    ],
  },
  {
    label: "Diaria Lunes a Viernes · Media Mañana (10:00–11:00 · 1h/día)",
    category: "semana",
    durationHours: 1,
    slots: [
      { day_of_week: 0, start_time: "10:00:00", end_time: "11:00:00" },
      { day_of_week: 1, start_time: "10:00:00", end_time: "11:00:00" },
      { day_of_week: 2, start_time: "10:00:00", end_time: "11:00:00" },
      { day_of_week: 3, start_time: "10:00:00", end_time: "11:00:00" },
      { day_of_week: 4, start_time: "10:00:00", end_time: "11:00:00" },
    ],
  },
  {
    label: "Diaria Lunes a Viernes · Tarde (14:00–15:00 · 1h/día)",
    category: "semana",
    durationHours: 1,
    slots: [
      { day_of_week: 0, start_time: "14:00:00", end_time: "15:00:00" },
      { day_of_week: 1, start_time: "14:00:00", end_time: "15:00:00" },
      { day_of_week: 2, start_time: "14:00:00", end_time: "15:00:00" },
      { day_of_week: 3, start_time: "14:00:00", end_time: "15:00:00" },
      { day_of_week: 4, start_time: "14:00:00", end_time: "15:00:00" },
    ],
  },
  {
    label: "Diaria Lunes a Viernes · Noche (18:00–19:00 · 1h/día)",
    category: "semana",
    durationHours: 1,
    slots: [
      { day_of_week: 0, start_time: "18:00:00", end_time: "19:00:00" },
      { day_of_week: 1, start_time: "18:00:00", end_time: "19:00:00" },
      { day_of_week: 2, start_time: "18:00:00", end_time: "19:00:00" },
      { day_of_week: 3, start_time: "18:00:00", end_time: "19:00:00" },
      { day_of_week: 4, start_time: "18:00:00", end_time: "19:00:00" },
    ],
  },

  // Sábados (4 a 6 horas)
  {
    label: "Sabatino Matutino (08:00–12:00 · 4 horas)",
    category: "sabado",
    durationHours: 4,
    slots: [{ day_of_week: 5, start_time: "08:00:00", end_time: "12:00:00" }],
  },
  {
    label: "Sabatino Matutino Intensivo (08:00–14:00 · 6 horas)",
    category: "sabado",
    durationHours: 6,
    slots: [{ day_of_week: 5, start_time: "08:00:00", end_time: "14:00:00" }],
  },
  {
    label: "Sabatino Vespertino (13:00–17:00 · 4 horas)",
    category: "sabado",
    durationHours: 4,
    slots: [{ day_of_week: 5, start_time: "13:00:00", end_time: "17:00:00" }],
  },
  {
    label: "Sabatino Vespertino Intensivo (13:00–19:00 · 6 horas)",
    category: "sabado",
    durationHours: 6,
    slots: [{ day_of_week: 5, start_time: "13:00:00", end_time: "19:00:00" }],
  },

  // Domingos (4 a 6 horas)
  {
    label: "Dominical Matutino (08:00–12:00 · 4 horas)",
    category: "domingo",
    durationHours: 4,
    slots: [{ day_of_week: 6, start_time: "08:00:00", end_time: "12:00:00" }],
  },
  {
    label: "Dominical Matutino Intensivo (08:00–14:00 · 6 horas)",
    category: "domingo",
    durationHours: 6,
    slots: [{ day_of_week: 6, start_time: "08:00:00", end_time: "14:00:00" }],
  },
  {
    label: "Dominical Vespertino (13:00–17:00 · 4 horas)",
    category: "domingo",
    durationHours: 4,
    slots: [{ day_of_week: 6, start_time: "13:00:00", end_time: "17:00:00" }],
  },
  {
    label: "Dominical Vespertino Intensivo (13:00–19:00 · 6 horas)",
    category: "domingo",
    durationHours: 6,
    slots: [{ day_of_week: 6, start_time: "13:00:00", end_time: "19:00:00" }],
  },
];
