import { useEffect, useState } from "react";

import { apiErrorMessage } from "../../lib/api";
import { DAYS } from "../../lib/format";
import { notify } from "../../lib/toast";
import {
  useAvailableTeachers,
  useCheckScheduleConflict,
  useCreateSchedule,
} from "../../lib/queries";
import type { Room } from "../../lib/types";
import { Button, Card, Field, Select } from "../../components/ui";

function fromDate(d: Date): { day_of_week: number; time: string } {
  const js = d.getDay();
  const day_of_week = (js + 6) % 7;
  return {
    day_of_week,
    time: `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:00`,
  };
}

export function CreateScheduleModal({
  slot,
  onClose,
  courses,
  rooms,
}: {
  slot: { start: Date; end: Date };
  onClose: () => void;
  courses: { id: number; name: string }[];
  rooms: Room[];
}) {
  const create = useCreateSchedule();
  const checkConflict = useCheckScheduleConflict();
  const availableTeachers = useAvailableTeachers();
  const [courseId, setCourseId] = useState(0);
  const [roomId, setRoomId] = useState(0);
  const [teacherId, setTeacherId] = useState(0);
  const [teacherOptions, setTeacherOptions] = useState<
    { id: number; full_name: string }[]
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  const { day_of_week, time: start_time } = fromDate(slot.start);
  const end_time = fromDate(slot.end).time;

  useEffect(() => {
    if (!courseId) {
      setTeacherOptions([]);
      return;
    }
    availableTeachers.mutate(
      { course_id: courseId, day_of_week, start_time, end_time },
      {
        onSuccess: (list) => setTeacherOptions(list),
        onError: () => setTeacherOptions([]),
      },
    );
    setTeacherId(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  async function submit(force = false) {
    setError(null);
    setWarnings([]);
    if (!courseId || !teacherId) {
      setError("Selecciona curso y profesor.");
      return;
    }
    const res = await checkConflict.mutateAsync({
      teacher_id: teacherId,
      room_id: roomId || null,
      course_id: courseId,
      day_of_week,
      start_time,
      end_time,
    });
    if (res.conflicts.length > 0) {
      setError("El profesor ya tiene una clase en ese horario.");
      return;
    }
    if (res.room_conflicts.length > 0) {
      setError("El aula ya está ocupada en ese horario.");
      return;
    }
    if (res.warnings.length > 0 && !force) {
      setWarnings(res.warnings);
      return;
    }
    try {
      await create.mutateAsync({
        course_id: courseId,
        teacher_id: teacherId,
        room_id: roomId || null,
        day_of_week,
        start_time,
        end_time,
        force,
      });
      notify("Horario creado", "success");
      onClose();
    } catch (e) {
      setError(apiErrorMessage(e, "No se pudo crear el horario."));
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4">
      <Card className="w-full max-w-sm">
        <h3 className="mb-1 font-medium">Nueva clase</h3>
        <p className="mb-4 text-sm text-slate-500">
          {DAYS[day_of_week]} · {start_time.slice(0, 5)}–{end_time.slice(0, 5)}
        </p>
        <div className="space-y-3">
          <Field label="Curso">
            <Select value={courseId} onChange={(e) => setCourseId(Number(e.target.value))}>
              <option value={0}>Curso…</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Aula (opcional)">
            <Select value={roomId} onChange={(e) => setRoomId(Number(e.target.value))}>
              <option value={0}>Sin aula…</option>
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
                    ? "Profesor…"
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
          {error && <p className="text-sm text-red-600">{error}</p>}
          {warnings.length > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
              {warnings.join(" · ")}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            {warnings.length > 0 ? (
              <Button
                variant="danger"
                disabled={create.isPending}
                onClick={() => submit(true)}
              >
                Crear igualmente
              </Button>
            ) : (
              <Button onClick={() => submit(false)} disabled={create.isPending}>
                Crear
              </Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
