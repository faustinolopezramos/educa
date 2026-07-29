import { useState } from "react";
import {
  ActionMenu,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Field,
  Input,
  Modal,
  ModalActions,
  Select,
  Table,
  Td,
  Th,
} from "../../components/ui";
import { DAYS } from "../../lib/format";
import {
  useCourses,
  useCreateCourse,
  useUpdateCourse,
  useDeleteCourse,
  useEnrollments,
  useLevels,
  useRooms,
  useSchedules,
  useUsers,
} from "../../lib/queries";
import { notify } from "../../lib/toast";
import type { Course } from "../../lib/types";
import { EnrollWizard } from "../enrollments/EnrollWizard";
import { CreateScheduleModal } from "../schedules/CreateScheduleModal";
import { RegisterTeacherWizard } from "./RegisterTeacherWizard";
import { UnifiedCourseWizardModal } from "./UnifiedCourseWizardModal";
import { onMutationError } from "./shared";

function initials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function CoursesPanel() {
  const { data: courses = [] } = useCourses();
  const { data: levels = [] } = useLevels();
  const { data: enrollments = [] } = useEnrollments();
  const { data: schedules = [] } = useSchedules();
  const { data: teachers = [] } = useUsers("teacher");
  const { data: rooms = [] } = useRooms();

  const create = useCreateCourse();
  const del = useDeleteCourse();

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedLevelId, setSelectedLevelId] = useState<number>(0);
  const [selectedTeacherId, setSelectedTeacherId] = useState<number>(0);
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");

  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [enrollCourseId, setEnrollCourseId] = useState<number | null>(null);
  const [teacherWizardCourseId, setTeacherWizardCourseId] = useState<number | null>(null);
  const [scheduleCourseId, setScheduleCourseId] = useState<number | null>(null);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);

  const [form, setForm] = useState({
    level_id: 0,
    name: "",
    max_students: 20,
    start_date: "",
    end_date: "",
  });
  const [toDelete, setToDelete] = useState<Course | null>(null);

  const levelCode = (id: number) => levels.find((l) => l.id === id)?.code ?? id;
  const levelName = (id: number) => levels.find((l) => l.id === id)?.name ?? `#${id}`;

  const totalCapacity = courses.reduce((acc, c) => acc + (c.max_students || 0), 0);

  const filteredCourses = courses.filter((c) => {
    if (selectedLevelId > 0 && c.level_id !== selectedLevelId) return false;
    
    // Check teacher filter
    if (selectedTeacherId > 0) {
      const courseScheds = schedules.filter((s) => s.course_id === c.id);
      const hasTeacher = courseScheds.some((s) => s.teacher_id === selectedTeacherId);
      if (!hasTeacher) return false;
    }

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      const code = String(levelCode(c.level_id)).toLowerCase();
      const matchSearch = c.name.toLowerCase().includes(term) || code.includes(term);
      if (!matchSearch) return false;
    }
    return true;
  });

  function submitQuick() {
    if (!form.level_id || !form.name) return;
    create.mutate(
      {
        ...form,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
      },
      {
        onSuccess: () => {
          setForm({
            level_id: 0,
            name: "",
            max_students: 20,
            start_date: "",
            end_date: "",
          });
          notify("Curso creado correctamente", "success");
        },
        onError: onMutationError("No se pudo crear el curso"),
      },
    );
  }

  return (
    <div className="space-y-4">
      {/* Ultra-Clean Minimalist Header Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600 font-bold text-lg">
            📚
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-serif text-xl font-bold text-slate-900">
                Gestión de Cursos
              </h2>
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                {courses.length} programas
              </span>
            </div>
            <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500">
              <span>👥 Capacidad total: <strong className="text-slate-800 font-semibold">{totalCapacity}</strong> cupos</span>
              <span>·</span>
              <span>🏷️ {levels.length} niveles</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-lg bg-slate-100 p-1 text-xs font-medium">
            <button
              onClick={() => setViewMode("cards")}
              className={`rounded-md px-2.5 py-1 transition ${
                viewMode === "cards"
                  ? "bg-white text-slate-900 shadow-2xs font-semibold"
                  : "text-slate-500 hover:text-slate-900"
              }`}
            >
              📱 Tarjetas
            </button>
            <button
              onClick={() => setViewMode("table")}
              className={`rounded-md px-2.5 py-1 transition ${
                viewMode === "table"
                  ? "bg-white text-slate-900 shadow-2xs font-semibold"
                  : "text-slate-500 hover:text-slate-900"
              }`}
            >
              📋 Tabla
            </button>
          </div>

          <Button
            className="bg-brand-600 hover:bg-brand-700 text-white font-semibold text-xs py-2 px-3.5 shadow-2xs"
            onClick={() => setIsWizardOpen(true)}
          >
            + Nuevo Curso
          </Button>
        </div>
      </div>

      {/* Sleek Filters Bar */}
      <div className="flex flex-col sm:flex-row gap-2.5 items-center justify-between bg-white p-3 rounded-2xl border border-slate-200/80 shadow-2xs text-xs">
        <div className="w-full sm:w-80">
          <Input
            placeholder="🔍 Buscar por nombre o nivel…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Select
            value={selectedLevelId}
            onChange={(e) => setSelectedLevelId(Number(e.target.value))}
          >
            <option value={0}>Todos los niveles</option>
            {levels.map((l) => (
              <option key={l.id} value={l.id}>
                {l.code} · {l.name}
              </option>
            ))}
          </Select>

          <Select
            value={selectedTeacherId}
            onChange={(e) => setSelectedTeacherId(Number(e.target.value))}
          >
            <option value={0}>Todos los profesores</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.full_name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {/* VIEW MODE 1: MINIMALIST CARDS GRID */}
      {viewMode === "cards" && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredCourses.length === 0 ? (
            <div className="col-span-full py-12 text-center text-slate-400 text-sm">
              No se encontraron cursos con los filtros seleccionados.
            </div>
          ) : (
            filteredCourses.map((c) => {
              const activeCount = enrollments.filter(
                (e) => e.course_id === c.id && e.status === "active"
              ).length;
              const capacityPct = Math.min(
                100,
                Math.round((activeCount / (c.max_students || 1)) * 100)
              );
              const courseSchedules = schedules.filter((s) => s.course_id === c.id);
              const leadTeacherId = courseSchedules.find((s) => s.teacher_id)?.teacher_id;
              const assignedTeacher = leadTeacherId
                ? teachers.find((t) => t.id === leadTeacherId)
                : null;

              return (
                <Card
                  key={c.id}
                  className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs hover:border-slate-300 transition flex flex-col justify-between space-y-3.5"
                >
                  {/* Header: Level + Name + Quick Actions */}
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <Badge color="indigo">{levelCode(c.level_id)}</Badge>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setEditingCourse(c)}
                          className="text-[11px] font-medium text-slate-400 hover:text-slate-700 px-1.5 py-0.5 rounded transition"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => setToDelete(c)}
                          className="text-[11px] font-medium text-red-400 hover:text-red-600 px-1.5 py-0.5 rounded transition"
                        >
                          ✕
                        </button>
                      </div>
                    </div>

                    <h3 className="font-semibold text-base text-slate-900 leading-snug">
                      {c.name}
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {levelName(c.level_id)}
                    </p>
                  </div>

                  {/* Teacher Info */}
                  <div className="flex items-center justify-between text-xs py-1.5 border-t border-slate-100">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-slate-400 font-medium">Docente:</span>
                      {assignedTeacher ? (
                        <span className="font-semibold text-slate-800 flex items-center gap-1">
                          <span className="h-5 w-5 rounded-full bg-brand-100 text-brand-700 font-bold text-[10px] inline-flex items-center justify-center">
                            {initials(assignedTeacher.full_name)}
                          </span>
                          {assignedTeacher.full_name.split(" ")[0]} {assignedTeacher.full_name.split(" ")[1] ?? ""}
                        </span>
                      ) : (
                        <span className="text-amber-700 text-[11px] font-medium">Sin asignar</span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setTeacherWizardCourseId(c.id)}
                      className="text-[11px] font-semibold text-brand-600 hover:text-brand-700 hover:underline"
                    >
                      {assignedTeacher ? "Cambiar" : "+ Asignar"}
                    </button>
                  </div>

                  {/* Schedules Summary */}
                  <div className="py-1.5 border-t border-slate-100 text-xs">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] text-slate-400 font-medium">Horario:</span>
                      <button
                        type="button"
                        onClick={() => setScheduleCourseId(c.id)}
                        className="text-[11px] font-semibold text-brand-600 hover:text-brand-700 hover:underline"
                      >
                        + Horario
                      </button>
                    </div>
                    {courseSchedules.length === 0 ? (
                      <span className="text-[11px] text-slate-400 italic">Sin horario configurado</span>
                    ) : (
                      <div className="space-y-1">
                        {courseSchedules.map((s) => (
                          <div key={s.id} className="flex items-center justify-between text-[11px]">
                            <span className="font-medium text-slate-700">
                              🕒 {DAYS[s.day_of_week]} {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}
                            </span>
                            <span className="text-[10px] font-semibold text-slate-500">
                              {s.modality === "virtual" ? "Virtual" : "Presencial"}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Cupos + Action */}
                  <div className="border-t border-slate-100 pt-3 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[11px] text-slate-500 font-medium">
                        👥 Ocupación
                      </span>
                      <span className="font-bold text-slate-800 text-[11px]">
                        {activeCount} / {c.max_students} ({capacityPct}%)
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full transition-all duration-300 ${
                          capacityPct >= 100 ? "bg-red-500" : capacityPct >= 80 ? "bg-amber-500" : "bg-emerald-500"
                        }`}
                        style={{ width: `${capacityPct}%` }}
                      />
                    </div>

                    <Button
                      className="w-full mt-2 bg-brand-50 text-brand-700 hover:bg-brand-100 font-semibold text-xs py-1.5 shadow-2xs"
                      onClick={() => setEnrollCourseId(c.id)}
                    >
                      + Inscribir Alumno
                    </Button>
                  </div>
                </Card>
              );
            })
          )}
        </div>
      )}

      {/* VIEW MODE 2: TABLE VIEW */}
      {viewMode === "table" && (
        <div className="grid gap-6 lg:grid-cols-3 items-start">
          <Card className="lg:col-span-1 space-y-4 border border-slate-200/80 rounded-2xl p-5 shadow-2xs">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-sm">Creación Rápida</h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Alta directa de curso básico.
              </p>
            </div>

            <div className="space-y-3.5 text-xs">
              <Field label="Nivel Académico (*)">
                <Select
                  value={form.level_id}
                  onChange={(e) =>
                    setForm({ ...form, level_id: Number(e.target.value) })
                  }
                >
                  <option value={0}>Selecciona nivel…</option>
                  {levels.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.code} · {l.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Nombre del Curso (*)">
                <Input
                  placeholder="Ej. Inglés A1 - Jornada Matutina"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </Field>

              <Field label="Cupo Máximo de Alumnos">
                <Input
                  type="number"
                  min={1}
                  value={form.max_students}
                  onChange={(e) =>
                    setForm({ ...form, max_students: Number(e.target.value) })
                  }
                />
              </Field>

              <Button
                className="w-full bg-slate-900 text-white hover:bg-slate-800 text-xs font-semibold"
                disabled={create.isPending || !form.level_id || !form.name}
                onClick={submitQuick}
              >
                Guardar Curso
              </Button>
            </div>
          </Card>

          <Card className="lg:col-span-2 p-0 overflow-hidden border border-slate-200/80 rounded-2xl shadow-2xs">
            <Table>
              <thead>
                <tr>
                  <Th>Nivel</Th>
                  <Th>Nombre Curso</Th>
                  <Th>Profesor</Th>
                  <Th>Cupo</Th>
                  <Th>Acciones</Th>
                </tr>
              </thead>
              <tbody>
                {filteredCourses.map((c) => {
                  const courseScheds = schedules.filter((s) => s.course_id === c.id);
                  const leadTeacherId = courseScheds.find((s) => s.teacher_id)?.teacher_id;
                  const assignedTeacher = leadTeacherId
                    ? teachers.find((t) => t.id === leadTeacherId)
                    : null;

                  return (
                    <tr key={c.id}>
                      <Td>
                        <span className="font-semibold text-slate-900">
                          {levelCode(c.level_id)}
                        </span>
                      </Td>
                      <Td>{c.name}</Td>
                      <Td>
                        {assignedTeacher ? (
                          <span className="font-medium text-slate-800">
                            {assignedTeacher.full_name}
                          </span>
                        ) : (
                          <span className="text-amber-700 text-xs italic">
                            Sin profesor
                          </span>
                        )}
                      </Td>
                      <Td>{c.max_students}</Td>
                      <Td>
                        <ActionMenu
                          items={[
                            {
                              label: "+ Inscribir Alumno",
                              onClick: () => setEnrollCourseId(c.id),
                            },
                            {
                              label: "Asignar / Cambiar Profesor",
                              onClick: () => setTeacherWizardCourseId(c.id),
                            },
                            {
                              label: "Gestionar Horarios",
                              onClick: () => setScheduleCourseId(c.id),
                            },
                            {
                              label: "Editar Curso",
                              onClick: () => setEditingCourse(c),
                            },
                            {
                              label: "Eliminar Curso",
                              onClick: () => setToDelete(c),
                              danger: true,
                            },
                          ]}
                        />
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </Card>
        </div>
      )}

      {/* Unified Creation Wizard Modal */}
      {isWizardOpen && (
        <UnifiedCourseWizardModal onClose={() => setIsWizardOpen(false)} />
      )}

      {/* Enroll Wizard Modal */}
      {enrollCourseId && (
        <EnrollWizard
          initialCourseId={enrollCourseId}
          onClose={() => setEnrollCourseId(null)}
        />
      )}

      {/* Teacher Assignment Wizard Modal for existing course */}
      {teacherWizardCourseId && (
        <RegisterTeacherWizard
          initialCourseId={teacherWizardCourseId}
          onClose={() => setTeacherWizardCourseId(null)}
        />
      )}

      {/* Direct Schedule Creation Modal for existing course */}
      {scheduleCourseId && (
        <CreateScheduleModal
          initialCourseId={scheduleCourseId}
          courses={courses}
          rooms={rooms}
          onClose={() => setScheduleCourseId(null)}
        />
      )}

      {/* Edit Course Modal for existing course */}
      {editingCourse && (
        <EditCourseModal
          course={editingCourse}
          onClose={() => setEditingCourse(null)}
        />
      )}

      {/* Delete Confirmation */}
      {toDelete && (
        <ConfirmDialog
          title="¿Eliminar este curso?"
          confirmLabel="Sí, eliminar curso"
          message={
            <p className="text-xs text-slate-600">
              Vas a eliminar <strong>{toDelete.name}</strong>. Esta acción
              eliminará también sus matrículas e historial asociado.
            </p>
          }
          onClose={() => setToDelete(null)}
          onConfirm={() => {
            del.mutate(toDelete.id, {
              onSuccess: () => {
                setToDelete(null);
                notify("Curso eliminado correctamente", "success");
              },
              onError: onMutationError("No se pudo eliminar el curso"),
            });
          }}
        />
      )}
    </div>
  );
}

function EditCourseModal({ course, onClose }: { course: Course; onClose: () => void }) {
  const { data: levels = [] } = useLevels();
  const update = useUpdateCourse();

  const [levelId, setLevelId] = useState(course.level_id);
  const [name, setName] = useState(course.name);
  const [maxStudents, setMaxStudents] = useState(course.max_students);
  const [startDate, setStartDate] = useState(course.start_date || "");
  const [endDate, setEndDate] = useState(course.end_date || "");

  function submit() {
    if (!name.trim() || !levelId) return;
    update.mutate(
      {
        id: course.id,
        level_id: levelId,
        name: name.trim(),
        max_students: maxStudents,
        start_date: startDate || null,
        end_date: endDate || null,
      },
      {
        onSuccess: () => {
          onClose();
          notify("Curso actualizado con éxito", "success");
        },
        onError: onMutationError("No se pudo actualizar el curso"),
      },
    );
  }

  return (
    <Modal
      title="Editar curso"
      description={course.name}
      onClose={onClose}
      onSubmit={submit}
      footer={
        <ModalActions>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={update.isPending || !name.trim()}>
            {update.isPending ? "Guardando…" : "Guardar cambios"}
          </Button>
        </ModalActions>
      }
    >
      <div className="space-y-4 text-xs">
        <Field label="Nivel Académico (*)">
          <Select value={levelId} onChange={(e) => setLevelId(Number(e.target.value))}>
            {levels.map((l) => (
              <option key={l.id} value={l.id}>
                {l.code} · {l.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Nombre del Curso (*)">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>

        <Field label="Cupo Máximo">
          <Input type="number" min={1} value={maxStudents} onChange={(e) => setMaxStudents(Number(e.target.value))} />
        </Field>

        <div className="grid grid-cols-2 gap-2">
          <Field label="Fecha Inicio">
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </Field>
          <Field label="Fecha Fin">
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </Field>
        </div>

      </div>
    </Modal>
  );
}
