import { useState } from "react";

import { Button, Field, Modal, ModalActions, Select, TimePicker } from "../../components/ui";
import { apiErrorMessage } from "../../lib/api";
import { DAYS } from "../../lib/format";
import {
  useCheckScheduleConflict,
  useCourses,
  useRooms,
  useUpdateSchedule,
  useUsers,
} from "../../lib/queries";
import { notify } from "../../lib/toast";
import type { Schedule } from "../../lib/types";

interface Props {
  schedule: Schedule;
  onClose: () => void;
}

export function EditScheduleModal({ schedule, onClose }: Props) {
  const { data: courses = [] } = useCourses();
  const { data: teachers = [] } = useUsers("teacher");
  const { data: rooms = [] } = useRooms();

  const updateSchedule = useUpdateSchedule();
  const checkConflict = useCheckScheduleConflict();

  const [courseId, setCourseId] = useState(schedule.course_id);
  const [teacherId, setTeacherId] = useState(schedule.teacher_id);
  const [dayOfWeek, setDayOfWeek] = useState(schedule.day_of_week);
  const [startTime, setStartTime] = useState(schedule.start_time.slice(0, 5));
  const [endTime, setEndTime] = useState(schedule.end_time.slice(0, 5));
  const [roomId, setRoomId] = useState(schedule.room_id ?? 0);

  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSave(force = false) {
    setError(null);
    setWarnings([]);
    setIsSubmitting(true);

    try {
      const conflictRes = await checkConflict.mutateAsync({
        teacher_id: teacherId,
        room_id: roomId || null,
        course_id: courseId,
        day_of_week: dayOfWeek,
        start_time: `${startTime}:00`,
        end_time: `${endTime}:00`,
        exclude_id: schedule.id,
      });

      if (conflictRes.conflicts.length > 0) {
        setError("El profesor ya tiene otra clase asignada en este mismo horario.");
        setIsSubmitting(false);
        return;
      }
      if (conflictRes.room_conflicts.length > 0) {
        setError("El aula seleccionada ya está ocupada en este mismo horario.");
        setIsSubmitting(false);
        return;
      }

      if (conflictRes.warnings.length > 0 && !force) {
        setWarnings(conflictRes.warnings);
        setIsSubmitting(false);
        return;
      }

      await updateSchedule.mutateAsync({
        id: schedule.id,
        course_id: courseId,
        teacher_id: teacherId,
        room_id: roomId || null,
        day_of_week: dayOfWeek,
        start_time: `${startTime}:00`,
        end_time: `${endTime}:00`,
        force,
      });

      notify("Horario actualizado con éxito", "success");
      onClose();
    } catch (e) {
      setIsSubmitting(false);
      setError(apiErrorMessage(e, "Error al actualizar el horario"));
    }
  }

  return (
    <Modal
      title="Editar horario"
      description="Se comprueba que ni el profesor ni el aula queden con dos clases a la vez."
      onClose={onClose}
      maxWidth="max-w-md"
      onSubmit={() => handleSave(warnings.length > 0)}
      footer={
        <ModalActions
          hint={warnings.length > 0 ? "Hay avisos sin resolver" : undefined}
        >
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          {warnings.length > 0 ? (
            <Button type="submit" variant="danger" disabled={isSubmitting}>
              {isSubmitting ? "Guardando…" : "Guardar de todos modos"}
            </Button>
          ) : (
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Guardando…" : "Guardar cambios"}
            </Button>
          )}
        </ModalActions>
      }
    >
      <div className="space-y-4 text-xs">
        <Field label="Curso (*)">
          <Select
            value={courseId}
            onChange={(e) => setCourseId(Number(e.target.value))}
          >
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Profesor Docente (*)">
          <Select
            value={teacherId}
            onChange={(e) => setTeacherId(Number(e.target.value))}
          >
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.full_name} ({t.email})
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Día de la Semana (*)">
          <Select
            value={dayOfWeek}
            onChange={(e) => setDayOfWeek(Number(e.target.value))}
          >
            {DAYS.map((d, i) => (
              <option key={i} value={i}>
                {d}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-slate-700 font-medium mb-1">Hora Inicio (*)</label>
            <TimePicker
              value={startTime}
              onChange={(val) => setStartTime(val)}
            />
          </div>

          <div>
            <label className="block text-slate-700 font-medium mb-1">Hora Fin (*)</label>
            <TimePicker
              value={endTime}
              onChange={(val) => setEndTime(val)}
            />
          </div>
        </div>

        <Field label="Aula Asignada">
          <Select
            value={roomId}
            onChange={(e) => setRoomId(Number(e.target.value))}
          >
            <option value={0}>Virtual (Clase online)</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} {r.is_virtual ? "(Virtual)" : ""}
              </option>
            ))}
          </Select>
        </Field>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-800">
            {error}
          </div>
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
