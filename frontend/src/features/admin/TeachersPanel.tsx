import { useState } from "react";

import { Button, Card, Field, Input, Select } from "../../components/ui";
import { DAYS, formatTime } from "../../lib/format";
import {
  useAddAvailability, useDeleteAvailability, useLanguages, useSetTeacherLanguages,
  useTeacherAvailability, useTeacherLanguages, useUsers,
} from "../../lib/queries";
import { onMutationError } from "./shared";

export function TeachersPanel() {
  const { data: teachers = [] } = useUsers("teacher");
  const { data: languages = [] } = useLanguages();
  const [teacherId, setTeacherId] = useState(0);

  const { data: teacherLangs = [] } = useTeacherLanguages(teacherId || undefined);
  const { data: availability = [] } = useTeacherAvailability(teacherId || undefined);
  const setLangs = useSetTeacherLanguages();
  const addAvail = useAddAvailability();
  const delAvail = useDeleteAvailability();

  const selectedLangIds = new Set(teacherLangs.map((t) => t.language_id));
  const [avail, setAvail] = useState({ day_of_week: 0, start_time: "08:00", end_time: "14:00" });

  function toggleLang(languageId: number) {
    const next = new Set(selectedLangIds);
    if (next.has(languageId)) next.delete(languageId);
    else next.add(languageId);
    setLangs.mutate(
      { teacherId, language_ids: [...next] },
      { onError: onMutationError("No se pudo guardar la cualificación") },
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <Field label="Profesor">
          <Select
            value={teacherId}
            onChange={(e) => setTeacherId(Number(e.target.value))}
          >
            <option value={0}>Selecciona un profesor…</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.full_name}
              </option>
            ))}
          </Select>
        </Field>
      </Card>

      {teacherId > 0 && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <h3 className="mb-1 font-medium">Idiomas que puede impartir</h3>
            <p className="mb-3 text-xs text-slate-500">
              Sin selección = sin restricción (se le puede asignar cualquier idioma).
            </p>
            <div className="space-y-1 text-sm">
              {languages.map((l) => (
                <label key={l.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selectedLangIds.has(l.id)}
                    onChange={() => toggleLang(l.id)}
                  />
                  {l.name}
                </label>
              ))}
            </div>
          </Card>

          <Card>
            <h3 className="mb-3 font-medium">Disponibilidad semanal</h3>
            <div className="mb-3 flex flex-wrap items-end gap-2">
              <Select
                className="w-auto"
                value={avail.day_of_week}
                onChange={(e) =>
                  setAvail({ ...avail, day_of_week: Number(e.target.value) })
                }
              >
                {DAYS.map((d, i) => (
                  <option key={i} value={i}>
                    {d}
                  </option>
                ))}
              </Select>
              <Input
                type="time"
                className="w-auto"
                value={avail.start_time}
                onChange={(e) => setAvail({ ...avail, start_time: e.target.value })}
              />
              <Input
                type="time"
                className="w-auto"
                value={avail.end_time}
                onChange={(e) => setAvail({ ...avail, end_time: e.target.value })}
              />
              <Button
                onClick={() =>
                  addAvail.mutate(
                    {
                      teacherId,
                      day_of_week: avail.day_of_week,
                      start_time: `${avail.start_time}:00`,
                      end_time: `${avail.end_time}:00`,
                    },
                    { onError: onMutationError("Rango inválido") },
                  )
                }
              >
                Añadir
              </Button>
            </div>
            <ul className="space-y-1 text-sm">
              {availability.length === 0 && (
                <li className="text-slate-400">Sin ventanas (disponible siempre).</li>
              )}
              {availability.map((w) => (
                <li
                  key={w.id}
                  className="flex items-center justify-between rounded bg-slate-50 px-3 py-1.5"
                >
                  <span>
                    {DAYS[w.day_of_week]} · {formatTime(w.start_time)}–
                    {formatTime(w.end_time)}
                  </span>
                  <Button
                    variant="ghost"
                    onClick={() => delAvail.mutate({ teacherId, id: w.id })}
                  >
                    ✕
                  </Button>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </div>
  );
}
