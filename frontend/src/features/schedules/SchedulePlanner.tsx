import { addDays, addMinutes, format, getDay, parse, startOfWeek } from "date-fns";
import { es } from "date-fns/locale";
import { useEffect, useMemo, useState } from "react";
import {
  Calendar,
  dateFnsLocalizer,
  type Event as RBCEvent,
} from "react-big-calendar";
import withDragAndDrop from "react-big-calendar/lib/addons/dragAndDrop";

import "react-big-calendar/lib/css/react-big-calendar.css";
import "react-big-calendar/lib/addons/dragAndDrop/styles.css";

import { apiErrorMessage } from "../../lib/api";
import { DAYS } from "../../lib/format";
import { notify } from "../../lib/toast";
import {
  useAvailableTeachers,
  useCheckScheduleConflict,
  useCourses,
  useCreateSchedule,
  useRooms,
  useSchedules,
  useUpdateSchedule,
  useUsers,
} from "../../lib/queries";
import type { Room, Schedule } from "../../lib/types";
import { Button, Card, Field, Select } from "../../components/ui";

const locales = { es };
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: (date: Date) => startOfWeek(date, { weekStartsOn: 1 }),
  getDay,
  locales,
});

// A fixed anchor: the Monday of the current week. Schedules are weekly-recurring,
// so we render them on this reference week and read day/time back on drop.
const WEEK_START = startOfWeek(new Date(), { weekStartsOn: 1 });

interface ScheduleEvent extends RBCEvent {
  id: number;
  start: Date;
  end: Date;
  resource: Schedule;
}

const DnDCalendar = withDragAndDrop<ScheduleEvent>(Calendar);

// "HH:MM:SS" on the reference week for a given day_of_week (0=Mon..6=Sun).
function toDate(dow: number, hhmmss: string): Date {
  const [h, m] = hhmmss.split(":").map(Number);
  return addMinutes(addDays(WEEK_START, dow), h * 60 + m);
}

// Map a JS Date back to our day_of_week (Mon=0..Sun=6) and "HH:MM:SS".
function fromDate(d: Date): { day_of_week: number; time: string } {
  const js = getDay(d); // Sun=0..Sat=6
  const day_of_week = (js + 6) % 7; // Mon=0..Sun=6
  return { day_of_week, time: format(d, "HH:mm:ss") };
}

export function SchedulePlanner() {
  const { data: schedules = [] } = useSchedules();
  const { data: courses = [] } = useCourses();
  const { data: teachers = [] } = useUsers("teacher");
  const { data: rooms = [] } = useRooms();
  const update = useUpdateSchedule();
  const checkConflict = useCheckScheduleConflict();
  const [error, setError] = useState<string | null>(null);
  const [slot, setSlot] = useState<{ start: Date; end: Date } | null>(null);

  const courseName = (id: number) => courses.find((c) => c.id === id)?.name ?? `#${id}`;
  const teacherName = (id: number) =>
    teachers.find((t) => t.id === id)?.full_name ?? `#${id}`;

  const events: ScheduleEvent[] = useMemo(
    () =>
      schedules.map((s) => ({
        id: s.id,
        title: `${courseName(s.course_id)} · ${teacherName(s.teacher_id)}`,
        start: toDate(s.day_of_week, s.start_time),
        end: toDate(s.day_of_week, s.end_time),
        resource: s,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [schedules, courses, teachers],
  );

  // Shared handler for drag-move and resize: validate then persist (or revert).
  async function moveOrResize({
    event,
    start,
    end,
  }: {
    event: ScheduleEvent;
    start: Date | string;
    end: Date | string;
  }) {
    setError(null);
    const startD = new Date(start);
    const endD = new Date(end);
    const { day_of_week, time: start_time } = fromDate(startD);
    const end_time = fromDate(endD).time;

    if (start_time >= end_time) {
      setError("La hora de inicio debe ser anterior a la de fin.");
      return; // no state change → calendar reverts
    }

    const res = await checkConflict.mutateAsync({
      teacher_id: event.resource.teacher_id,
      room_id: event.resource.room_id,
      course_id: event.resource.course_id,
      day_of_week,
      start_time,
      end_time,
      exclude_id: event.id,
    });
    if (res.conflicts.length > 0) {
      const c = res.conflicts[0];
      setError(
        `Choque de profesor con "${c.course_name}" (${DAYS[c.day_of_week]} ${c.start_time.slice(
          0,
          5,
        )}–${c.end_time.slice(0, 5)}). No se movió.`,
      );
      return; // revert
    }
    if (res.room_conflicts.length > 0) {
      setError("El aula ya está ocupada en ese horario. No se movió.");
      return; // revert
    }

    try {
      // Admin explicitly dragged the block: bypass soft warnings but surface them.
      await update.mutateAsync({
        id: event.id,
        day_of_week,
        start_time,
        end_time,
        force: true,
      });
      if (res.warnings.length > 0) notify(res.warnings.join(" · "), "info");
    } catch (e) {
      setError(apiErrorMessage(e, "No se pudo mover el horario."));
    }
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      <Card className="p-3">
        <div style={{ height: 560 }}>
          <DnDCalendar
            localizer={localizer}
            events={events}
            defaultView="week"
            views={["week"]}
            toolbar={false}
            culture="es"
            step={30}
            timeslots={2}
            min={toDate(0, "07:00:00")}
            max={toDate(0, "22:00:00")}
            selectable
            resizable
            onEventDrop={moveOrResize}
            onEventResize={moveOrResize}
            onSelectSlot={(s) =>
              setSlot({ start: new Date(s.start), end: new Date(s.end) })
            }
            formats={{
              dayFormat: (d: Date) => DAYS[(getDay(d) + 6) % 7].slice(0, 3),
            }}
            style={{ height: "100%" }}
          />
        </div>
      </Card>
      <p className="text-xs text-slate-400">
        Arrastra o redimensiona un bloque para reprogramarlo; si choca con otra clase del
        profesor o del aula, se marca en rojo y se revierte. Haz clic en un hueco para crear
        una clase.
      </p>

      {slot && (
        <CreateScheduleModal
          slot={slot}
          onClose={() => setSlot(null)}
          courses={courses}
          rooms={rooms}
        />
      )}
    </div>
  );
}

function CreateScheduleModal({
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

  // When a course is chosen, list the teachers qualified + available + free.
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
      return; // ask for confirmation
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
