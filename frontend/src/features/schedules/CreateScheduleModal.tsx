import { useEffect, useState } from "react";

import { apiErrorMessage } from "../../lib/api";
import { DAYS } from "../../lib/format";
import { JORNADA_PRESETS } from "../../lib/jornadas";
import { notify } from "../../lib/toast";
import {
  useAvailableTeachers,
  useCheckScheduleConflict,
  useCreateSchedule,
} from "../../lib/queries";
import type { Room } from "../../lib/types";
import { Button, Field, Modal, ModalActions, Select, TimePicker } from "../../components/ui";

function fromDate(d: Date): { day_of_week: number; time: string } {
  const js = d.getDay();
  const day_of_week = (js + 6) % 7;
  return {
    day_of_week,
    time: `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:00`,
  };
}

function calculateDurationText(start: string, end: string): string {
  if (!start || !end) return "";
  const [sH, sM] = start.split(":").map(Number);
  const [eH, eM] = end.split(":").map(Number);
  const totalMinutes = (eH * 60 + eM) - (sH * 60 + sM);
  if (totalMinutes <= 0) return "Hora de fin debe ser posterior a la de inicio";
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hours > 0 && mins > 0) return `${hours}h ${mins}m por clase`;
  if (hours > 0) return `${hours} ${hours === 1 ? "hora" : "horas"} por clase`;
  return `${mins} minutos por clase`;
}

export function CreateScheduleModal({
  slot,
  onClose,
  courses,
  rooms,
  initialCourseId,
}: {
  slot?: { start: Date; end: Date };
  onClose: () => void;
  courses: { id: number; name: string }[];
  rooms: Room[];
  initialCourseId?: number;
}) {
  const create = useCreateSchedule();
  const checkConflict = useCheckScheduleConflict();
  const availableTeachers = useAvailableTeachers();

  const [mode, setMode] = useState<"custom" | "preset">("custom");
  const [jornadaIndex, setJornadaIndex] = useState(0);

  const now = new Date();
  const defaultSlot = { start: now, end: new Date(now.getTime() + 3600000) };
  const effectiveSlot = slot ?? defaultSlot;

  const clicked = fromDate(effectiveSlot.start);
  const clickedEnd = fromDate(effectiveSlot.end).time;

  // Custom schedule inputs
  const [selectedDays, setSelectedDays] = useState<number[]>([clicked.day_of_week]);
  const [startTime, setStartTime] = useState(clicked.time.slice(0, 5));
  const [endTime, setEndTime] = useState(clickedEnd.slice(0, 5));

  const [courseId, setCourseId] = useState(initialCourseId ?? 0);
  const [roomId, setRoomId] = useState(0);
  const [teacherId, setTeacherId] = useState(0);
  const [teacherOptions, setTeacherOptions] = useState<{ id: number; full_name: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  // Compute final slots to create
  const slots =
    mode === "preset"
      ? JORNADA_PRESETS[jornadaIndex].slots
      : selectedDays.map((d) => ({
          day_of_week: d,
          start_time: `${startTime}:00`,
          end_time: `${endTime}:00`,
        }));

  const firstSlot = slots[0] || { day_of_week: 0, start_time: "08:00:00", end_time: "09:00:00" };

  function toggleDay(d: number) {
    if (selectedDays.includes(d)) {
      if (selectedDays.length > 1) {
        setSelectedDays(selectedDays.filter((day) => day !== d));
      }
    } else {
      setSelectedDays([...selectedDays, d].sort((a, b) => a - b));
    }
  }

  useEffect(() => {
    if (!courseId) {
      setTeacherOptions([]);
      return;
    }
    availableTeachers.mutate(
      {
        course_id: courseId,
        day_of_week: firstSlot.day_of_week,
        start_time: firstSlot.start_time,
        end_time: firstSlot.end_time,
      },
      {
        onSuccess: (list) => setTeacherOptions(list),
        onError: () => setTeacherOptions([]),
      },
    );
    setTeacherId(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId, mode, jornadaIndex, selectedDays.join(","), startTime, endTime]);

  async function submit(force = false) {
    setError(null);
    setWarnings([]);
    if (!courseId || !teacherId) {
      setError("Selecciona curso y profesor.");
      return;
    }
    if (slots.length === 0) {
      setError("Selecciona al menos un día para impartir la clase.");
      return;
    }

    const results = await Promise.all(
      slots.map((s) =>
        checkConflict.mutateAsync({
          teacher_id: teacherId,
          room_id: roomId || null,
          course_id: courseId,
          day_of_week: s.day_of_week,
          start_time: s.start_time,
          end_time: s.end_time,
        }),
      ),
    );
    if (results.some((r) => r.conflicts.length > 0)) {
      setError("El profesor ya tiene una clase en ese horario.");
      return;
    }
    if (results.some((r) => r.room_conflicts.length > 0)) {
      setError("El aula ya está ocupada en ese horario.");
      return;
    }
    const allWarnings = results.flatMap((r) => r.warnings);
    if (allWarnings.length > 0 && !force) {
      setWarnings(allWarnings);
      return;
    }
    try {
      for (const s of slots) {
        await create.mutateAsync({
          course_id: courseId,
          teacher_id: teacherId,
          room_id: roomId || null,
          day_of_week: s.day_of_week,
          start_time: s.start_time,
          end_time: s.end_time,
          force,
        });
      }
      notify(slots.length > 1 ? "Horarios creados correctamente" : "Horario creado correctamente", "success");
      onClose();
    } catch (e) {
      setError(apiErrorMessage(e, "No se pudo crear el horario."));
    }
  }

  const durationText = mode === "custom" ? calculateDurationText(startTime, endTime) : "";

  const slotCountLabel =
    slots.length > 1 ? `Se crearán ${slots.length} franjas` : undefined;

  return (
    <Modal
      title="Nuevo horario"
      description="Elige los días y la hora; solo se ofrecen profesores libres en esa franja."
      onClose={onClose}
      maxWidth="max-w-md"
      onSubmit={() => submit(warnings.length > 0)}
      footer={
        <ModalActions hint={warnings.length > 0 ? "Hay avisos sin resolver" : slotCountLabel}>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          {warnings.length > 0 ? (
            <Button type="submit" variant="danger" disabled={create.isPending}>
              {create.isPending ? "Creando…" : "Crear de todos modos"}
            </Button>
          ) : (
            <Button type="submit" disabled={create.isPending || !courseId || !teacherId}>
              {create.isPending ? "Creando…" : "Crear horario"}
            </Button>
          )}
        </ModalActions>
      }
    >
      <div className="space-y-3.5 text-xs">
        <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-0.5">
          <button
            type="button"
            onClick={() => setMode("custom")}
            className={`flex-1 rounded-md px-2.5 py-1.5 transition ${
              mode === "custom"
                ? "bg-white font-semibold text-slate-900 shadow-2xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Horario libre
          </button>
          <button
            type="button"
            onClick={() => setMode("preset")}
            className={`flex-1 rounded-md px-2.5 py-1.5 transition ${
              mode === "preset"
                ? "bg-white font-semibold text-slate-900 shadow-2xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Plantillas
          </button>
        </div>

        {mode === "custom" ? (
          <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/50 p-3">
            {/* Day Selector Checkboxes */}
            <div>
              <label className="block text-slate-700 font-medium mb-1.5">Días de impartición</label>
              <div className="flex flex-wrap gap-1">
                {DAYS.map((dName, idx) => {
                  const checked = selectedDays.includes(idx);
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => toggleDay(idx)}
                      className={`rounded-md px-2.5 py-1 font-medium transition ${
                        checked
                          ? "bg-brand-600 text-white shadow-2xs"
                          : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      {dName.slice(0, 3)}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Start & End Time Inputs */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-600 mb-1">Hora Inicio</label>
                <TimePicker
                  className="!py-1"
                  value={startTime}
                  onChange={(val) => setStartTime(val)}
                />
              </div>
              <div>
                <label className="block text-slate-600 mb-1">Hora Fin</label>
                <TimePicker
                  className="!py-1"
                  value={endTime}
                  onChange={(val) => setEndTime(val)}
                />
              </div>
            </div>

            {durationText && (
              <div className="flex items-center justify-between rounded-lg bg-white px-2.5 py-1.5 border border-slate-200 font-mono text-[11px] text-slate-700">
                <span>⏱️ Duración:</span>
                <strong className="text-brand-700 font-semibold">{durationText}</strong>
              </div>
            )}
          </div>
        ) : (
          <Field label="Seleccionar Plantilla Preconfigurada">
            <Select
              value={jornadaIndex}
              onChange={(e) => setJornadaIndex(Number(e.target.value))}
            >
              <optgroup label="📅 Entre Semana (Lunes a Viernes · 1h/día)">
                {JORNADA_PRESETS.map((p, i) =>
                  p.category === "semana" ? (
                    <option key={p.label} value={i}>
                      {p.label}
                    </option>
                  ) : null,
                )}
              </optgroup>
              <optgroup label="☀️ Fin de Semana · Sábados (4h a 6h)">
                {JORNADA_PRESETS.map((p, i) =>
                  p.category === "sabado" ? (
                    <option key={p.label} value={i}>
                      {p.label}
                    </option>
                  ) : null,
                )}
              </optgroup>
              <optgroup label="🌙 Fin de Semana · Domingos (4h a 6h)">
                {JORNADA_PRESETS.map((p, i) =>
                  p.category === "domingo" ? (
                    <option key={p.label} value={i}>
                      {p.label}
                    </option>
                  ) : null,
                )}
              </optgroup>
            </Select>
          </Field>
        )}

        <Field label="Curso">
          <Select value={courseId} onChange={(e) => setCourseId(Number(e.target.value))}>
            <option value={0}>Selecciona un curso…</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Aula (opcional)">
          <Select value={roomId} onChange={(e) => setRoomId(Number(e.target.value))}>
            <option value={0}>Virtual (Clase online)</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
                {r.is_virtual ? " (virtual)" : ""}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label={
            courseId
              ? `Profesor (${teacherOptions.length} disponible(s) para esta franja)`
              : "Profesor"
          }
        >
          <Select
            value={teacherId}
            disabled={!courseId}
            onChange={(e) => setTeacherId(Number(e.target.value))}
          >
            <option value={0}>
              {courseId
                ? teacherOptions.length
                  ? "Selecciona profesor…"
                  : "Ningún profesor disponible"
                : "Elige un curso primero"}
            </option>
            {teacherOptions.map((t) => (
              <option key={t.id} value={t.id}>
                {t.full_name}
              </option>
            ))}
          </Select>
        </Field>

        {error && (
          <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-800">{error}</p>
        )}
        {warnings.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-800">
            {warnings.join(" · ")}
          </div>
        )}
      </div>
    </Modal>
  );
}
