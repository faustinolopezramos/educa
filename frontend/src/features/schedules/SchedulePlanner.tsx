import { addDays, addMinutes, format, getDay, parse, startOfWeek } from "date-fns";
import { es } from "date-fns/locale";
import { useMemo, useState } from "react";
import {
  Calendar,
  dateFnsLocalizer,
  type Event as RBCEvent,
} from "react-big-calendar";
import withDragAndDrop from "react-big-calendar/lib/addons/dragAndDrop";

import "react-big-calendar/lib/css/react-big-calendar.css";
import "react-big-calendar/lib/addons/dragAndDrop/styles.css";

import {
  Badge, Button, Card, ConfirmDialog, Modal, ModalActions, Select, Table, Td, Th,
} from "../../components/ui";
import { apiErrorMessage } from "../../lib/api";
import { DAYS } from "../../lib/format";
import {
  useCheckScheduleConflict,
  useCourses,
  useDeleteSchedule,
  useEnrollments,
  useRooms,
  useSchedules,
  useUpdateSchedule,
  useUsers,
} from "../../lib/queries";
import { notify } from "../../lib/toast";
import type { Modality, Schedule } from "../../lib/types";
import { CreateScheduleModal } from "./CreateScheduleModal";
import { EditScheduleModal } from "./EditScheduleModal";

const locales = { es };
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: (date: Date) => startOfWeek(date, { weekStartsOn: 1 }),
  getDay,
  locales,
});

const WEEK_START = startOfWeek(new Date(), { weekStartsOn: 1 });

interface ScheduleEvent extends RBCEvent {
  id: number;
  start: Date;
  end: Date;
  resource: Schedule;
}

const DnDCalendar = withDragAndDrop<ScheduleEvent>(Calendar);

function toDate(dow: number, hhmmss: string): Date {
  const [h, m] = hhmmss.split(":").map(Number);
  return addMinutes(addDays(WEEK_START, dow), h * 60 + m);
}

function fromDate(d: Date): { day_of_week: number; time: string } {
  const js = getDay(d);
  const day_of_week = (js + 6) % 7;
  return { day_of_week, time: format(d, "HH:mm:ss") };
}

export function SchedulePlanner() {
  const { data: schedules = [] } = useSchedules();
  const { data: courses = [] } = useCourses();
  const { data: teachers = [] } = useUsers("teacher");
  const { data: rooms = [] } = useRooms();
  const { data: enrollments = [] } = useEnrollments();

  const update = useUpdateSchedule();
  const remove = useDeleteSchedule();
  const checkConflict = useCheckScheduleConflict();

  const [viewMode, setViewMode] = useState<"calendar" | "list">("calendar");
  const [filterCourse, setFilterCourse] = useState<number | "all">("all");
  const [filterTeacher, setFilterTeacher] = useState<number | "all">("all");
  const [filterModality, setFilterModality] = useState<Modality | "all">("all");
  const [filterRoom, setFilterRoom] = useState<number | "all">("all");

  const [error, setError] = useState<string | null>(null);
  const [slot, setSlot] = useState<{ start: Date; end: Date } | null>(null);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(null);
  const [deletingSchedule, setDeletingSchedule] = useState<Schedule | null>(null);

  const courseName = (id: number) => courses.find((c) => c.id === id)?.name ?? `#${id}`;
  const teacherName = (id: number) =>
    teachers.find((t) => t.id === id)?.full_name ?? `#${id}`;
  const roomName = (id?: number | null) => {
    if (!id) return "Virtual";
    const r = rooms.find((rm) => rm.id === id);
    return r ? `${r.name}${r.is_virtual ? " (Virtual)" : ""}` : `#${id}`;
  };

  const filteredSchedules = useMemo(() => {
    return schedules.filter((s) => {
      if (filterCourse !== "all" && s.course_id !== filterCourse) return false;
      if (filterTeacher !== "all" && s.teacher_id !== filterTeacher) return false;
      if (filterModality !== "all" && s.modality !== filterModality) return false;
      if (filterRoom !== "all" && s.room_id !== filterRoom) return false;
      return true;
    });
  }, [schedules, filterCourse, filterTeacher, filterModality, filterRoom]);

  const events: ScheduleEvent[] = useMemo(
    () =>
      filteredSchedules.map((s) => ({
        id: s.id,
        title: `${courseName(s.course_id)} · ${teacherName(s.teacher_id)}`,
        start: toDate(s.day_of_week, s.start_time),
        end: toDate(s.day_of_week, s.end_time),
        resource: s,
      })),
    [filteredSchedules, courses, teachers],
  );

  async function moveOrResize({
    event,
    start,
    end,
  }: {
    event: ScheduleEvent;
    start: string | Date;
    end: string | Date;
  }) {
    setError(null);
    const startDate = new Date(start);
    const endDate = new Date(end);

    const { day_of_week, time: start_time } = fromDate(startDate);
    const { time: end_time } = fromDate(endDate);

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
      return;
    }
    if (res.room_conflicts.length > 0) {
      setError("El aula ya está ocupada en ese horario. No se movió.");
      return;
    }

    try {
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

  function handleDelete(id: number) {
    remove.mutate(id, {
      onSuccess: () => {
        setDeletingSchedule(null);
        setSelectedSchedule(null);
        notify("Horario eliminado con éxito", "success");
      },
      onError: (e: unknown) => {
        setDeletingSchedule(null);
        notify(apiErrorMessage(e, "Error al eliminar horario"), "error");
      },
    });
  }

  // Event Custom Style Supplier
  function eventPropGetter(event: ScheduleEvent) {
    const isVirtual = event.resource.modality === "virtual";
    return {
      style: {
        backgroundColor: isVirtual ? "#4f46e5" : "#0d9488",
        borderRadius: "8px",
        opacity: 0.95,
        color: "#ffffff",
        border: "none",
        fontSize: "11px",
        fontWeight: "600",
        boxShadow: "0 2px 4px rgba(0,0,0,0.08)",
      },
    };
  }

  // Group schedules by Day of Week (0..6) for list view
  const byDayMap = new Map<number, Schedule[]>();
  for (let i = 0; i < 7; i++) byDayMap.set(i, []);
  for (const s of filteredSchedules) {
    const list = byDayMap.get(s.day_of_week) || [];
    list.push(s);
  }

  // Helper details for selected schedule modal
  const selectedCourse = selectedSchedule
    ? courses.find((c) => c.id === selectedSchedule.course_id)
    : null;
  const selectedTeacher = selectedSchedule
    ? teachers.find((t) => t.id === selectedSchedule.teacher_id)
    : null;
  const selectedEnrolledCount = selectedSchedule
    ? enrollments.filter(
        (e) => e.course_id === selectedSchedule.course_id && e.status === "active"
      ).length
    : 0;

  return (
    <div className="space-y-4">
      {/* Control Bar: Mode Toggle + Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 pb-4">
        <div className="flex items-center gap-1.5 rounded-xl bg-slate-100 p-1 text-xs">
          <button
            type="button"
            onClick={() => setViewMode("calendar")}
            className={`rounded-lg px-3.5 py-2 font-medium transition ${
              viewMode === "calendar"
                ? "bg-white text-brand-700 shadow-2xs font-bold"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            📅 Calendario Semanal
          </button>
          <button
            type="button"
            onClick={() => setViewMode("list")}
            className={`rounded-lg px-3.5 py-2 font-medium transition ${
              viewMode === "list"
                ? "bg-white text-brand-700 shadow-2xs font-bold"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            📋 Lista por Días
          </button>
        </div>

        {/* Filter Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <Select
            className="max-w-[11rem] text-xs !py-1"
            value={filterCourse}
            onChange={(e) =>
              setFilterCourse(e.target.value === "all" ? "all" : Number(e.target.value))
            }
          >
            <option value="all">Todos los cursos…</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>

          <Select
            className="max-w-[11rem] text-xs !py-1"
            value={filterTeacher}
            onChange={(e) =>
              setFilterTeacher(e.target.value === "all" ? "all" : Number(e.target.value))
            }
          >
            <option value="all">Todos los profesores…</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.full_name}
              </option>
            ))}
          </Select>

          <Select
            className="max-w-[10rem] text-xs !py-1"
            value={filterModality}
            onChange={(e) =>
              setFilterModality(e.target.value as Modality | "all")
            }
          >
            <option value="all">Toda modalidad</option>
            <option value="virtual">💻 Virtual</option>
            <option value="presencial">🏫 Presencial</option>
            <option value="semi_presencial">🔀 Semi Presencial</option>
          </Select>

          <Select
            className="max-w-[10rem] text-xs !py-1"
            value={filterRoom}
            onChange={(e) =>
              setFilterRoom(e.target.value === "all" ? "all" : Number(e.target.value))
            }
          >
            <option value="all">Todas las aulas</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800 border border-amber-200">
          {error}
        </div>
      )}

      {viewMode === "calendar" ? (
        <Card className="p-3 shadow-2xs border-slate-200/80 rounded-2xl">
          <DnDCalendar
            localizer={localizer}
            events={events}
            defaultView="week"
            views={["week", "day"]}
            step={30}
            timeslots={2}
            min={new Date(0, 0, 0, 7, 0)}
            max={new Date(0, 0, 0, 22, 0)}
            selectable
            onSelectSlot={({ start, end }) => setSlot({ start, end })}
            onSelectEvent={(evt) => setSelectedSchedule(evt.resource)}
            onEventDrop={moveOrResize}
            onEventResize={moveOrResize}
            eventPropGetter={eventPropGetter}
            className="h-[650px] rounded-lg"
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {DAYS.map((dayName, dow) => {
            const list = byDayMap.get(dow) || [];
            if (list.length === 0) return null;
            return (
              <Card key={dow} className="p-4 space-y-3">
                <h3 className="font-bold text-slate-900 text-sm border-b border-slate-100 pb-2">
                  🗓️ {dayName} ({list.length} clase{list.length > 1 ? "s" : ""})
                </h3>
                <Table>
                  <thead>
                    <tr>
                      <Th>Horario</Th>
                      <Th>Curso</Th>
                      <Th>Profesor</Th>
                      <Th>Modalidad / Aula</Th>
                      <Th>Acciones</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((s) => (
                      <tr key={s.id}>
                        <Td>
                          <span className="font-semibold text-slate-900">
                            {s.start_time.slice(0, 5)} – {s.end_time.slice(0, 5)}
                          </span>
                        </Td>
                        <Td>{courseName(s.course_id)}</Td>
                        <Td>{teacherName(s.teacher_id)}</Td>
                        <Td>
                          <Badge color={s.modality === "virtual" ? "indigo" : "slate"}>
                            {s.modality === "virtual" ? "Virtual" : roomName(s.room_id)}
                          </Badge>
                        </Td>
                        <Td>
                          <div className="flex items-center space-x-2">
                            <Button variant="ghost" className="text-xs py-1 px-2" onClick={() => setSelectedSchedule(s)}>
                              Ver
                            </Button>
                            <Button variant="ghost" className="text-xs py-1 px-2" onClick={() => setEditingSchedule(s)}>
                              Editar
                            </Button>
                            <Button
                              variant="ghost"
                              className="text-xs py-1 px-2 text-red-600 hover:text-red-700"
                              onClick={() => handleDelete(s.id)}
                            >
                              ✕
                            </Button>
                          </div>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Card>
            );
          })}
        </div>
      )}

      {/* Modal: Schedule Details on Click */}
      {selectedSchedule && (
        <Modal
          title={selectedCourse ? selectedCourse.name : `Horario #${selectedSchedule.course_id}`}
          description={`${DAYS[selectedSchedule.day_of_week]} · ${selectedSchedule.start_time.slice(0, 5)}–${selectedSchedule.end_time.slice(0, 5)}`}
          onClose={() => setSelectedSchedule(null)}
          footer={
            <ModalActions>
              <Button
                variant="secondary"
                className="text-red-700"
                onClick={() => setDeletingSchedule(selectedSchedule)}
              >
                Eliminar
              </Button>
              <Button
                onClick={() => {
                  const sched = selectedSchedule;
                  setSelectedSchedule(null);
                  setEditingSchedule(sched);
                }}
              >
                Editar horario
              </Button>
            </ModalActions>
          }
        >
          <div className="space-y-4 text-xs">
            <div className="flex justify-end">
              <Badge color={selectedSchedule.modality === "virtual" ? "indigo" : "slate"}>
                {selectedSchedule.modality === "virtual" ? "Virtual" : "Presencial"}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl">
              <div>
                <span className="text-slate-400 font-medium block">Profesor Encargado</span>
                <span className="font-bold text-slate-800">
                  {selectedTeacher ? selectedTeacher.full_name : "Sin profesor"}
                </span>
              </div>

              <div>
                <span className="text-slate-400 font-medium block">Aula / Ubicación</span>
                <span className="font-bold text-slate-800">
                  {selectedSchedule.modality === "virtual"
                    ? "Enlace Virtual (Lobby)"
                    : roomName(selectedSchedule.room_id)}
                </span>
              </div>

              <div>
                <span className="text-slate-400 font-medium block">Alumnos Inscritos</span>
                <span className="font-bold text-emerald-700">
                  {selectedEnrolledCount} / {selectedCourse?.max_students || "—"} cupos
                </span>
              </div>

              <div>
                <span className="text-slate-400 font-medium block">ID Horario</span>
                <span className="font-semibold text-slate-600">#{selectedSchedule.id}</span>
              </div>
            </div>

            {selectedSchedule.join_url && (
              <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-3">
                <span className="font-semibold text-indigo-900 block mb-1">🔗 Enlace de Clase</span>
                <a
                  href={selectedSchedule.join_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-brand-600 hover:underline break-all"
                >
                  {selectedSchedule.join_url}
                </a>
              </div>
            )}

          </div>
        </Modal>
      )}

      {deletingSchedule && (
        <ConfirmDialog
          title="Eliminar horario"
          message={
            <>
              Se eliminará la franja de{" "}
              <strong>
                {courses.find((c) => c.id === deletingSchedule.course_id)?.name ??
                  `#${deletingSchedule.course_id}`}
              </strong>{" "}
              del {DAYS[deletingSchedule.day_of_week]} a las{" "}
              {deletingSchedule.start_time.slice(0, 5)}. Las sesiones ya generadas para
              este horario dejarán de estar programadas.
            </>
          }
          busy={remove.isPending}
          onConfirm={() => handleDelete(deletingSchedule.id)}
          onClose={() => setDeletingSchedule(null)}
        />
      )}

      {slot && (
        <CreateScheduleModal
          slot={slot}
          onClose={() => setSlot(null)}
          courses={courses}
          rooms={rooms}
        />
      )}
      {editingSchedule && (
        <EditScheduleModal schedule={editingSchedule} onClose={() => setEditingSchedule(null)} />
      )}
    </div>
  );
}
