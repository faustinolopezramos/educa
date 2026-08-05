import { useState } from "react";
import {
  ActionMenu,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  MetaItem,
  Modal,
  ModalActions,
  PageHeader,
  SearchInput,
  SegmentedControl,
  Select,
  Table,
  Td,
  Th,
  Toolbar,
} from "../../components/ui";
import { IconBook } from "../../components/icons";
import { DAYS, calculateEndDate, modalityLabel } from "../../lib/format";
import {
  useCourses,
  useCreateCourse,
  useUpdateCourse,
  useDeleteCourse,
  useLanguages,
  useLevels,
  useRooms,
  useSchedules,
  useUsers,
} from "../../lib/queries";
import { notify } from "../../lib/toast";
import type { Course, CourseStatus } from "../../lib/types";
import { CourseStatusBadge, CourseStatusControl } from "./CourseStatusControl";
import { EnrollWizard } from "../enrollments/EnrollWizard";
import { CreateScheduleModal } from "../schedules/CreateScheduleModal";
import { AssignTeacherModal } from "./AssignTeacherModal";
import { UnifiedCourseWizardModal } from "./UnifiedCourseWizardModal";
import { onMutationError } from "./shared";

export function CoursesPanel() {
  const { data: courses = [] } = useCourses();
  const { data: languages = [] } = useLanguages();
  const { data: levels = [] } = useLevels();
  const { data: schedules = [] } = useSchedules();
  const { data: teachers = [] } = useUsers("teacher");
  const { data: rooms = [] } = useRooms();

  const create = useCreateCourse();
  const del = useDeleteCourse();

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedLanguageId, setSelectedLanguageId] = useState<number>(0);
  const [selectedLevelId, setSelectedLevelId] = useState<number>(0);
  const [selectedTeacherId, setSelectedTeacherId] = useState<number>(0);
  const [selectedStatus, setSelectedStatus] = useState<CourseStatus | "all">("all");
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

  const languageNameForLevel = (levelId: number) => {
    const lvl = levels.find((l) => l.id === levelId);
    if (!lvl) return "";
    const lang = languages.find((g) => g.id === lvl.language_id);
    return lang ? lang.name : "";
  };

  const totalCapacity = courses.reduce((acc, c) => acc + (c.max_students || 0), 0);

  const filteredCourses = courses.filter((c) => {
    if (selectedStatus !== "all" && c.status !== selectedStatus) return false;

    if (selectedLanguageId > 0) {
      const lvl = levels.find((l) => l.id === c.level_id);
      if (!lvl || lvl.language_id !== selectedLanguageId) return false;
    }

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
      const area = languageNameForLevel(c.level_id).toLowerCase();
      const matchSearch =
        c.name.toLowerCase().includes(term) ||
        code.includes(term) ||
        area.includes(term);
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

  const filtersActive =
    selectedLanguageId > 0 ||
    selectedLevelId > 0 ||
    selectedTeacherId > 0 ||
    selectedStatus !== "all" ||
    searchTerm.trim() !== "";

  return (
    <div>
      <PageHeader
        title="Cursos"
        meta={
          <>
            <MetaItem
              value={courses.filter((c) => c.status === "open" || c.status === "in_progress").length}
              label="activos"
            />
            <MetaItem
              value={courses.filter((c) => c.status === "draft").length}
              label="en borrador"
            />
            <MetaItem value={totalCapacity} label="cupos totales" />
            <MetaItem value={levels.length} label="niveles" />
          </>
        }
        actions={
          <>
            <SegmentedControl
              value={viewMode}
              onChange={setViewMode}
              options={[
                { value: "cards", label: "Tarjetas" },
                { value: "table", label: "Tabla" },
              ]}
            />
            <Button onClick={() => setIsWizardOpen(true)}>Nuevo curso</Button>
          </>
        }
      />

      <Toolbar>
        <SearchInput
          className="w-full sm:w-72"
          placeholder="Buscar por nombre, área o nivel"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <Select
          className="w-full sm:w-52"
          value={selectedLanguageId}
          onChange={(e) => {
            const langId = Number(e.target.value);
            setSelectedLanguageId(langId);
            if (langId > 0 && selectedLevelId > 0) {
              const lvl = levels.find((l) => l.id === selectedLevelId);
              if (!lvl || lvl.language_id !== langId) {
                setSelectedLevelId(0);
              }
            }
          }}
        >
          <option value={0}>Todas las áreas académicas</option>
          {languages.map((lang) => (
            <option key={lang.id} value={lang.id}>
              {lang.name}
            </option>
          ))}
        </Select>
        <Select
          className="w-full sm:w-52"
          value={selectedLevelId}
          onChange={(e) => setSelectedLevelId(Number(e.target.value))}
        >
          <option value={0}>Todos los niveles</option>
          {levels
            .filter((l) => selectedLanguageId === 0 || l.language_id === selectedLanguageId)
            .map((l) => {
              const lang = languages.find((g) => g.id === l.language_id);
              return (
                <option key={l.id} value={l.id}>
                  {lang ? `${lang.name} · ` : ""}{l.code} ({l.name})
                </option>
              );
            })}
        </Select>
        <Select
          className="w-full sm:w-52"
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
        {filtersActive && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearchTerm("");
              setSelectedLanguageId(0);
              setSelectedLevelId(0);
              setSelectedTeacherId(0);
              setSelectedStatus("all");
            }}
          >
            Limpiar
          </Button>
        )}
      </Toolbar>

      {/* VIEW MODE 1: CARDS GRID */}
      {viewMode === "cards" && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredCourses.length === 0 ? (
            <div className="col-span-full">
              <EmptyState
                icon={<IconBook className="h-5 w-5" />}
                title={filtersActive ? "Ningún curso coincide" : "Todavía no hay cursos"}
                message={
                  filtersActive
                    ? "Prueba con otro nivel, otro profesor o limpia la búsqueda."
                    : "Crea el primero para poder matricular alumnos y asignar horarios."
                }
                action={
                  filtersActive ? (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setSearchTerm("");
                        setSelectedLevelId(0);
                        setSelectedTeacherId(0);
                      }}
                    >
                      Limpiar filtros
                    </Button>
                  ) : (
                    <Button onClick={() => setIsWizardOpen(true)}>Nuevo curso</Button>
                  )
                }
              />
            </div>
          ) : (
            filteredCourses.map((c) => {
              // Counted server-side, and counted the way the cupo is: an
              // "Inscrito" student holds a seat too. This used to count only
              // `active`, so a course could look half empty while being full.
              const activeCount = c.seats_taken;
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
                <Card key={c.id} padding="sm" className="flex flex-col">
                  {/* Cabecera: nivel, nombre y menú.
                      Las acciones viven en un solo menú en lugar de repartirse
                      entre un enlace "Editar", una ✕ y enlaces sueltos por
                      sección. */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {languageNameForLevel(c.level_id) && (
                          <Badge color="indigo">{languageNameForLevel(c.level_id)}</Badge>
                        )}
                        <Badge color="sky">{levelCode(c.level_id)}</Badge>
                        <Badge color="slate">
                          {c.periodicity === "bimensual"
                            ? "Bimensual"
                            : c.periodicity === "trimestral"
                              ? "Trimestral"
                              : c.periodicity === "cuatrimestral"
                                ? "Cuatrimestral"
                                : c.periodicity === "semestral"
                                  ? "Semestral"
                                  : c.periodicity === "anual"
                                    ? "Anual"
                                    : "Mensual"}
                        </Badge>
                        <CourseStatusBadge status={c.status} />
                      </div>
                      <h3 className="mt-1.5 truncate text-sm font-bold text-slate-900">
                        {c.name}
                      </h3>
                      <p className="truncate text-xs text-slate-500">
                        {languageNameForLevel(c.level_id) ? `Área Académica: ${languageNameForLevel(c.level_id)} • ` : ""}Nivel: {levelName(c.level_id)}
                      </p>
                    </div>
                    <ActionMenu
                      items={[
                        { label: "Inscribir alumno", onClick: () => setEnrollCourseId(c.id) },
                        {
                          label: assignedTeacher ? "Cambiar profesor" : "Asignar profesor",
                          onClick: () => setTeacherWizardCourseId(c.id),
                        },
                        { label: "Añadir horario", onClick: () => setScheduleCourseId(c.id) },
                        { label: "Editar curso", onClick: () => setEditingCourse(c) },
                        ...(c.status !== "in_progress" && c.seats_taken === 0
                          ? [
                              {
                                label: "Eliminar curso",
                                onClick: () => setToDelete(c),
                                danger: true,
                              },
                            ]
                          : []),
                      ]}
                    />
                  </div>

                  <div className="mt-3 border-t border-slate-100 pt-3">
                    {/* The next move in the course's life, offered where the
                        course is — not buried in an edit form. Only the legal
                        moves appear; a refused one explains what it still
                        needs. */}
                    <CourseStatusControl course={c} />
                  </div>

                  <dl className="mt-3 space-y-2 border-t border-slate-100 pt-3 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <dt className="text-slate-500">Profesor</dt>
                      <dd className="min-w-0 truncate font-medium text-slate-900">
                        {assignedTeacher ? (
                          assignedTeacher.full_name
                        ) : (
                          <span className="text-amber-700">Sin asignar</span>
                        )}
                      </dd>
                    </div>

                    <div className="flex items-start justify-between gap-2">
                      <dt className="flex-none text-slate-500">Horario</dt>
                      <dd className="min-w-0 text-right font-medium text-slate-900">
                        {courseSchedules.length === 0 ? (
                          <span className="text-amber-700">Sin definir</span>
                        ) : (
                          courseSchedules.map((s) => (
                            <div key={s.id} className="tabular">
                              {DAYS[s.day_of_week]} {s.start_time.slice(0, 5)}–
                              {s.end_time.slice(0, 5)}
                              <span className="ml-1.5 font-normal text-slate-500">
                                {modalityLabel(s.modality)}
                              </span>
                            </div>
                          ))
                        )}
                      </dd>
                    </div>
                  </dl>

                  <div className="mt-auto space-y-1.5 border-t border-slate-100 pt-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500">Ocupación</span>
                      <span className="tabular font-semibold text-slate-900">
                        {activeCount}/{c.max_students}
                      </span>
                    </div>
                    <div
                      className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100"
                      role="progressbar"
                      aria-valuenow={capacityPct}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`Ocupación de ${c.name}`}
                    >
                      <div
                        className={`h-full ${
                          capacityPct >= 100
                            ? "bg-red-600"
                            : capacityPct >= 80
                              ? "bg-amber-500"
                              : "bg-emerald-600"
                        }`}
                        style={{ width: `${capacityPct}%` }}
                      />
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="mt-2 w-full"
                      onClick={() => setEnrollCourseId(c.id)}
                    >
                      Inscribir alumno
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
        <div className="grid items-start gap-5 lg:grid-cols-3">
          <Card className="lg:col-span-1">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="text-sm font-semibold text-slate-900">Creación rápida</h3>
              <p className="mt-0.5 text-xs text-slate-500">
                Para un curso básico. El asistente completo pide horario y profesor.
              </p>
            </div>

            <div className="mt-4 space-y-3.5">
              <Field label="Nivel académico">
                <Select
                  value={form.level_id}
                  onChange={(e) => setForm({ ...form, level_id: Number(e.target.value) })}
                >
                  <option value={0}>Selecciona nivel…</option>
                  {levels.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.code} · {l.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Nombre del curso">
                <Input
                  placeholder="Ej. Inglés A1 — Jornada matutina"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </Field>

              <Field label="Cupo máximo">
                <Input
                  type="number"
                  min={1}
                  value={form.max_students}
                  onChange={(e) => setForm({ ...form, max_students: Number(e.target.value) })}
                />
              </Field>

              <Button
                className="w-full"
                disabled={create.isPending || !form.level_id || !form.name}
                onClick={submitQuick}
              >
                {create.isPending ? "Guardando…" : "Guardar curso"}
              </Button>
            </div>
          </Card>

          <Card padding="none" className="overflow-hidden lg:col-span-2">
            <Table>
              <thead>
                <tr>
                  <Th>Área Académica</Th>
                  <Th>Nivel</Th>
                  <Th>Curso</Th>
                  <Th>Periodicidad</Th>
                  <Th>Profesor</Th>
                  <Th align="right">Cupo</Th>
                  <Th align="right">Acciones</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCourses.map((c) => {
                  const courseScheds = schedules.filter((s) => s.course_id === c.id);
                  const leadTeacherId = courseScheds.find((s) => s.teacher_id)?.teacher_id;
                  const assignedTeacher = leadTeacherId
                    ? teachers.find((t) => t.id === leadTeacherId)
                    : null;

                  return (
                    <tr key={c.id} className="hover:bg-slate-50">
                      <Td>
                        <span className="font-semibold text-indigo-700">
                          {languageNameForLevel(c.level_id) || "—"}
                        </span>
                      </Td>
                      <Td>
                        <span className="font-semibold text-slate-900">
                          {levelCode(c.level_id)}
                        </span>
                      </Td>
                      <Td>{c.name}</Td>
                      <Td>
                        <Badge color="slate">
                          {c.periodicity === "bimensual"
                            ? "Bimensual"
                            : c.periodicity === "trimestral"
                              ? "Trimestral"
                              : c.periodicity === "cuatrimestral"
                                ? "Cuatrimestral"
                                : c.periodicity === "semestral"
                                  ? "Semestral"
                                  : c.periodicity === "anual"
                                    ? "Anual"
                                    : "Mensual"}
                        </Badge>
                      </Td>
                      <Td>
                        {assignedTeacher ? (
                          assignedTeacher.full_name
                        ) : (
                          <span className="text-amber-700">Sin asignar</span>
                        )}
                      </Td>
                      <Td align="right">
                        <span className="tabular">{c.max_students}</span>
                      </Td>
                      <Td align="right">
                        <ActionMenu
                          items={[
                            {
                              label: "Inscribir alumno",
                              onClick: () => setEnrollCourseId(c.id),
                            },
                            {
                              label: assignedTeacher ? "Cambiar profesor" : "Asignar profesor",
                              onClick: () => setTeacherWizardCourseId(c.id),
                            },
                            {
                              label: "Gestionar horarios",
                              onClick: () => setScheduleCourseId(c.id),
                            },
                            { label: "Editar curso", onClick: () => setEditingCourse(c) },
                            ...(c.status !== "in_progress" && c.seats_taken === 0
                              ? [
                                  {
                                    label: "Eliminar curso",
                                    onClick: () => setToDelete(c),
                                    danger: true,
                                  },
                                ]
                              : []),
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

      {/* Assigning is one step. Building the timetable is offered right
          afterwards when the course has none, because a course with no slots
          cannot be opened for enrolment. */}
      {teacherWizardCourseId && (
        <AssignTeacherModal
          initialCourseId={teacherWizardCourseId}
          onCreateSchedule={(cId) => {
            setTeacherWizardCourseId(null);
            setScheduleCourseId(cId);
          }}
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

      {/* Delete Confirmation / Protection Dialog */}
      {toDelete && (
        toDelete.status === "in_progress" || toDelete.seats_taken > 0 ? (
          <Modal
            title="Curso protegido contra eliminación"
            description="El sistema protege la integridad de notas, asistencias y cobros de los alumnos."
            onClose={() => setToDelete(null)}
            maxWidth="max-w-md"
            footer={
              <ModalActions>
                <Button variant="secondary" onClick={() => setToDelete(null)}>
                  Entendido
                </Button>
                <Button
                  onClick={() => {
                    const c = toDelete;
                    setToDelete(null);
                    setEditingCourse(c);
                  }}
                >
                  Editar o Cambiar Estado
                </Button>
              </ModalActions>
            }
          >
            <div className="space-y-3 text-sm text-slate-600">
              <p>
                El curso <strong>{toDelete.name}</strong>{" "}
                {toDelete.status === "in_progress"
                  ? "se encuentra en desarrollo actualmente"
                  : `cuenta con ${toDelete.seats_taken} alumno(s) matriculado(s)`}.
              </p>
              <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-xs leading-relaxed text-amber-900">
                <strong>¿Por qué no se puede eliminar?</strong>
                <br />
                Eliminar un curso activo borraría el historial de notas, asistencias y comprobantes financieros de sus estudiantes. Para cerrar el curso de forma segura, cámbialo a estado <strong>Concluido</strong> o <strong>Archivado</strong>.
              </div>
            </div>
          </Modal>
        ) : (
          <ConfirmDialog
            title="Eliminar borrador de curso"
            confirmLabel="Eliminar borrador"
            busy={del.isPending}
            message={
              <>
                Se eliminará el borrador sin alumnos del curso <strong>{toDelete.name}</strong>. Esta acción no se puede deshacer.
              </>
            }
            onClose={() => setToDelete(null)}
            onConfirm={() => {
              del.mutate(toDelete.id, {
                onSuccess: () => {
                  setToDelete(null);
                  notify("Borrador de curso eliminado correctamente", "success");
                },
                onError: onMutationError("No se pudo eliminar el curso"),
              });
            }}
          />
        )
      )}
    </div>
  );
}

function EditCourseModal({ course, onClose }: { course: Course; onClose: () => void }) {
  const { data: languages = [] } = useLanguages();
  const { data: levels = [] } = useLevels();
  const update = useUpdateCourse();

  const [levelId, setLevelId] = useState(course.level_id);
  const [name, setName] = useState(course.name);
  const [maxStudents, setMaxStudents] = useState(course.max_students);
  const [periodicity, setPeriodicity] = useState<string>(course.periodicity || "mensual");
  const [startDate, setStartDate] = useState(course.start_date || "");
  const [endDate, setEndDate] = useState(course.end_date || "");

  function handlePeriodicityOrDateChange(p: string, start: string) {
    setPeriodicity(p);
    setStartDate(start);
    if (!start) return;
    const calcEnd = calculateEndDate(start, p);
    if (calcEnd) setEndDate(calcEnd);
  }

  function submit() {
    if (!name.trim() || !levelId) return;
    update.mutate(
      {
        id: course.id,
        level_id: levelId,
        name: name.trim(),
        max_students: maxStudents,
        periodicity: periodicity || null,
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
      maxWidth="max-w-xl"
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
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Nivel académico" required={true}>
            <Select value={levelId} onChange={(e) => setLevelId(Number(e.target.value))}>
              {levels.map((l) => {
                const lang = languages.find((g) => g.id === l.language_id);
                return (
                  <option key={l.id} value={l.id}>
                    {lang ? `${lang.name} · ` : ""}{l.code} ({l.name})
                  </option>
                );
              })}
            </Select>
          </Field>

          <Field label="Cupo máximo" required={true}>
            <Input
              type="number"
              min={1}
              value={maxStudents}
              onChange={(e) => setMaxStudents(Number(e.target.value))}
            />
          </Field>
        </div>

        <Field label="Nombre del curso" required={true}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Inglés Intensivo A1" />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Periodicidad del Curso" required={true}>
            <Select
              value={periodicity}
              onChange={(e) => handlePeriodicityOrDateChange(e.target.value, startDate)}
            >
              <option value="mensual">Mensual (1 mes)</option>
              <option value="bimensual">Bimensual (2 meses)</option>
              <option value="trimestral">Trimestral (3 meses)</option>
              <option value="cuatrimestral">Cuatrimestral (4 meses)</option>
              <option value="semestral">Semestral (6 meses)</option>
              <option value="anual">Anual (1 año)</option>
              <option value="custom">Personalizado</option>
            </Select>
          </Field>

          <Field label="Fecha de inicio">
            <Input
              type="date"
              value={startDate}
              onChange={(e) => handlePeriodicityOrDateChange(periodicity, e.target.value)}
            />
          </Field>

          <Field label="Fecha de fin (Sugerida)">
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
