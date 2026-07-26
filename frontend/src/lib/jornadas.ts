/** Jornada/Plan presets: predefined day+time combinations the business
 * offers, on top of the free-form day/hour picker `Schedule` already
 * supports. Picking one just fills in one or more day_of_week/start_time/
 * end_time slots — no separate backend concept, see LOGICA_DE_NEGOCIO.
 */
export interface JornadaPreset {
  label: string;
  /** One entry per class day this jornada meets (Nocturna meets twice a week). */
  slots: { day_of_week: number; start_time: string; end_time: string }[];
}

// day_of_week: 0=Monday .. 6=Sunday.
export const JORNADA_PRESETS: JornadaPreset[] = [
  {
    label: "Nocturna · Lunes y Miércoles",
    slots: [
      { day_of_week: 0, start_time: "18:00:00", end_time: "20:00:00" },
      { day_of_week: 2, start_time: "18:00:00", end_time: "20:00:00" },
    ],
  },
  {
    label: "Nocturna · Martes y Jueves",
    slots: [
      { day_of_week: 1, start_time: "18:00:00", end_time: "20:00:00" },
      { day_of_week: 3, start_time: "18:00:00", end_time: "20:00:00" },
    ],
  },
  {
    label: "Plan Sabatino · Matutina",
    slots: [{ day_of_week: 5, start_time: "08:00:00", end_time: "12:00:00" }],
  },
  {
    label: "Plan Sabatino · Vespertina",
    slots: [{ day_of_week: 5, start_time: "14:00:00", end_time: "18:00:00" }],
  },
  {
    label: "Plan Dominical · Matutina",
    slots: [{ day_of_week: 6, start_time: "08:00:00", end_time: "12:00:00" }],
  },
  {
    label: "Plan Dominical · Vespertina",
    slots: [{ day_of_week: 6, start_time: "14:00:00", end_time: "18:00:00" }],
  },
];
