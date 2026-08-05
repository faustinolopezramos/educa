import { useEffect, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import {
  Badge, Button, Card, Field, Input, Modal, ModalActions, PageHeader, SearchInput,
  SegmentedControl, Select, Table, Td, Th, Toolbar,
} from "../../components/ui";
import { api, apiErrorMessage } from "../../lib/api";
import { formatDateTime } from "../../lib/format";
import { canManageGrades } from "../../lib/nav";
import { notify } from "../../lib/toast";
import type { Assignment, AssignmentSubmission, Course, RosterStudentStatus } from "../../lib/types";

const QUICK_FEEDBACK_TAGS = [
  "¡Excelente trabajo! 👏",
  "Buen análisis, cuida los detalles.",
  "Entregado a tiempo. Buen esfuerzo.",
  "Requiere profundizar en las conclusiones.",
];

export function AssignmentsPanel() {
  const { user } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [submissions, setSubmissions] = useState<Record<number, AssignmentSubmission[]>>({});
  const [rosterMap, setRosterMap] = useState<Record<number, RosterStudentStatus[]>>({});
  const [selectedCourseId, setSelectedCourseId] = useState<number | "all">("all");
  const [selectedFilter, setSelectedFilter] = useState<"all" | "pending" | "completed">("all");
  // Guards the three dialogs below: without it a double click posts the same
  // assignment or submission twice.
  const [saving, setSaving] = useState(false);

  // Create Assignment Modal state (Teacher/Admin)
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newResourceUrl, setNewResourceUrl] = useState("");
  const [newDueDate, setNewDueDate] = useState("");
  const [newCourseId, setNewCourseId] = useState<number>(0);

  // Submit Assignment Modal state (Student)
  const [submittingAssignment, setSubmittingAssignment] = useState<Assignment | null>(null);
  const [subContent, setSubContent] = useState("");
  const [subUrl, setSubUrl] = useState("");

  // Grade Submission Modal state (Teacher)
  const [gradingStudentStatus, setGradingStudentStatus] = useState<{
    assignment: Assignment;
    student: RosterStudentStatus;
  } | null>(null);
  const [gradeScore, setGradeScore] = useState<number>(10);
  const [gradeFeedback, setGradeFeedback] = useState("");
  // Manage Submissions Hub Modal state (Teacher/Staff)
  const [managingAssignment, setManagingAssignment] = useState<Assignment | null>(null);
  const [subFilterTab, setSubFilterTab] = useState<string>("todos");
  const [subSearch, setSubSearch] = useState("");

  const isStaff = canManageGrades(user);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [cRes, aRes] = await Promise.all([
        api.get<Course[]>("/catalog/courses"),
        api.get<Assignment[]>("/assignments"),
      ]);
      const loadedCourses = Array.isArray(cRes.data) ? cRes.data : [];
      const loadedAssignments = Array.isArray(aRes.data) ? aRes.data : [];
      setCourses(loadedCourses);
      setAssignments(loadedAssignments);
      if (loadedCourses.length > 0) {
        setNewCourseId((prev) => (prev === 0 ? loadedCourses[0].id : prev));
      }

      // En paralelo, no en fila. Esto era un `await` dentro del bucle: dos
      // peticiones por tarea, encadenadas una tras otra, de modo que treinta
      // tareas eran sesenta viajes de ida y vuelta en serie antes de que el
      // panel pintara nada. El coste ahora es el de la petición más lenta, no
      // el de la suma de todas.
      const subsMap: Record<number, AssignmentSubmission[]> = {};
      const rosMap: Record<number, RosterStudentStatus[]> = {};

      async function loadOne<T>(url: string): Promise<T[]> {
        try {
          const res = await api.get<T[]>(url);
          return Array.isArray(res.data) ? res.data : [];
        } catch {
          // Una tarea que falla no puede vaciar el panel entero; se queda sin
          // entregas y las demás se pintan igual.
          return [];
        }
      }

      await Promise.all(
        loadedAssignments.flatMap((a) => [
          loadOne<AssignmentSubmission>(`/assignments/${a.id}/submissions`).then(
            (rows) => {
              subsMap[a.id] = rows;
            },
          ),
          ...(isStaff
            ? [
                loadOne<RosterStudentStatus>(
                  `/assignments/${a.id}/roster-status`,
                ).then((rows) => {
                  rosMap[a.id] = rows;
                }),
              ]
            : []),
        ]),
      );
      setSubmissions(subsMap);
      setRosterMap(rosMap);
    } catch (err) {
      notify(apiErrorMessage(err, "Error al cargar tareas"), "error");
    }
  }

  function openCreateAssignmentModal() {
    setNewTitle("");
    setNewDesc("");
    setNewResourceUrl("");
    setNewDueDate("");
    if (courses.length > 0) {
      setNewCourseId(courses[0].id);
    }
    setShowCreate(true);
  }

  async function handleCreateAssignment() {
    const targetCourseId = Number(newCourseId) || (courses.length > 0 ? courses[0].id : 0);
    if (!newTitle.trim()) {
      notify("Ingresa el título de la tarea", "error");
      return;
    }
    if (!targetCourseId) {
      notify("Selecciona un curso válido", "error");
      return;
    }

    let formattedDueDate: string | null = null;
    if (newDueDate) {
      const parsedDate = new Date(newDueDate);
      if (!isNaN(parsedDate.getTime())) {
        formattedDueDate = parsedDate.toISOString();
      }
    }

    setSaving(true);
    try {
      await api.post("/assignments", {
        course_id: targetCourseId,
        title: newTitle.trim(),
        description: newDesc.trim() || null,
        resource_url: newResourceUrl.trim() || null,
        due_date: formattedDueDate,
      });
      notify("Tarea asignada con éxito", "success");
      setShowCreate(false);
      setNewTitle("");
      setNewDesc("");
      setNewResourceUrl("");
      setNewDueDate("");
      loadData();
    } catch (err) {
      notify(apiErrorMessage(err, "Error al crear la tarea"), "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmitWork() {
    if (!submittingAssignment) return;
    if (!subContent && !subUrl) {
      notify("Agrega un texto o un enlace para tu entrega", "error");
      return;
    }
    setSaving(true);
    try {
      await api.post(`/assignments/${submittingAssignment.id}/submissions`, {
        content: subContent || null,
        submission_url: subUrl || null,
      });
      notify("Tarea entregada correctamente", "success");
      setSubmittingAssignment(null);
      setSubContent("");
      setSubUrl("");
      loadData();
    } catch (err) {
      notify(apiErrorMessage(err, "Error al entregar la tarea"), "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleGradeSubmission() {
    if (!gradingStudentStatus || !gradingStudentStatus.student.submission_id) return;
    setSaving(true);
    try {
      await api.patch(`/assignments/submissions/${gradingStudentStatus.student.submission_id}`, {
        score: Number(gradeScore),
        feedback: gradeFeedback || null,
      });
      notify("Calificación guardada con éxito", "success");
      setGradingStudentStatus(null);
      setGradeFeedback("");
      loadData();
    } catch (err) {
      notify(apiErrorMessage(err, "Error al calificar entrega"), "error");
    } finally {
      setSaving(false);
    }
  }

  const safeAssignments = Array.isArray(assignments) ? assignments : [];
  const safeCourses = Array.isArray(courses) ? courses : [];

  const filteredAssignments = safeAssignments.filter((a) => {
    if (selectedCourseId !== "all" && a.course_id !== selectedCourseId) return false;
    const subs = submissions[a.id] || [];
    const studentSub = subs.find((s) => s.student_id === user?.id);

    if (selectedFilter === "pending") {
      if (isStaff) return subs.some((s) => s.status !== "graded");
      return !studentSub || studentSub.status !== "graded";
    }
    if (selectedFilter === "completed") {
      if (isStaff) return subs.length > 0 && subs.every((s) => s.status === "graded");
      return studentSub && studentSub.status === "graded";
    }
    return true;
  });

  // Calculate Metrics
  const totalCount = safeAssignments.length;
  const pendingCount = safeAssignments.filter((a) => {
    const subs = submissions[a.id] || [];
    const studentSub = subs.find((s) => s.student_id === user?.id);
    return isStaff ? subs.some((s) => s.status !== "graded") : (!studentSub || studentSub.status !== "graded");
  }).length;
  const completedCount = totalCount - pendingCount;

  function getDueBadge(assignment: Assignment, studentSub?: AssignmentSubmission) {
    if (studentSub) {
      if (studentSub.status === "graded") {
        return <Badge color="green">Calificada ({studentSub.score}/10)</Badge>;
      }
      if (studentSub.is_late) {
        return <Badge color="amber">Entregada con retraso</Badge>;
      }
      return <Badge color="indigo">Entregada</Badge>;
    }

    if (!assignment.due_date) {
      return <Badge color="slate">Sin fecha límite</Badge>;
    }

    const now = new Date().getTime();
    const due = new Date(assignment.due_date).getTime();
    const diffHours = (due - now) / (1000 * 3600);

    if (diffHours < 0) {
      return <Badge color="red">Vencida</Badge>;
    }
    if (diffHours <= 24) {
      return <Badge color="amber">Vence hoy</Badge>;
    }
    if (diffHours <= 72) {
      return <Badge color="indigo">Vence pronto</Badge>;
    }
    return <Badge color="slate">Pendiente</Badge>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tareas y Evaluaciones"
        description="Asignación de trabajos, recepción de entregas y libro de retroalimentación."
        actions={
          isStaff ? (
            <Button onClick={openCreateAssignmentModal}>
              + Nueva Tarea
            </Button>
          ) : undefined
        }
      />

      {/* Metrics Header */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-slate-200/80 bg-white px-4 py-3 shadow-sm">
          <div className="text-xs text-slate-500 font-medium">Total Tareas</div>
          <div className="mt-0.5 text-2xl font-semibold text-slate-900">{totalCount}</div>
        </div>
        <div className="rounded-xl border border-amber-200/60 bg-amber-50/40 px-4 py-3 shadow-sm">
          <div className="text-xs text-amber-700 font-medium">Pendientes</div>
          <div className="mt-0.5 text-2xl font-semibold text-amber-900">{pendingCount}</div>
        </div>
        <div className="rounded-xl border border-emerald-200/60 bg-emerald-50/40 px-4 py-3 shadow-sm">
          <div className="text-xs text-emerald-700 font-medium">Completadas</div>
          <div className="mt-0.5 text-2xl font-semibold text-emerald-900">{completedCount}</div>
        </div>
      </div>

      {/* Clean Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
          <button
            onClick={() => setSelectedFilter("all")}
            className={`rounded-md px-3.5 py-1.5 text-xs font-semibold transition ${
              selectedFilter === "all" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Todas ({totalCount})
          </button>
          <button
            onClick={() => setSelectedFilter("pending")}
            className={`rounded-md px-3.5 py-1.5 text-xs font-semibold transition ${
              selectedFilter === "pending" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            ⚡ Pendientes ({pendingCount})
          </button>
          <button
            onClick={() => setSelectedFilter("completed")}
            className={`rounded-md px-3.5 py-1.5 text-xs font-semibold transition ${
              selectedFilter === "completed" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            ✅ Completadas ({completedCount})
          </button>
        </div>

        <Select
          className="max-w-xs"
          value={selectedCourseId}
          onChange={(e) => setSelectedCourseId(e.target.value === "all" ? "all" : Number(e.target.value))}
        >
          <option value="all">Todos los cursos</option>
          {safeCourses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>

      {/* Task Grid */}
      {filteredAssignments.length === 0 ? (
        <Card className="py-12 text-center text-slate-400">
          No hay tareas en esta categoría.
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-2">
          {filteredAssignments.map((a) => {
            const courseName = safeCourses.find((c) => c.id === a.course_id)?.name || "Curso";
            const subs = submissions[a.id] || [];
            const studentSub = subs.find((s) => s.student_id === user?.id);
            const roster = rosterMap[a.id] || [];

            return (
              <Card key={a.id} className="flex flex-col justify-between transition-all hover:shadow-md">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-xs font-semibold text-brand-600">{courseName}</span>
                      <h4 className="font-semibold text-slate-900 text-base">{a.title}</h4>
                    </div>
                    {getDueBadge(a, studentSub)}
                  </div>

                  {a.description && (
                    <p className="mt-2 text-xs leading-relaxed text-slate-600 line-clamp-3">
                      {a.description}
                    </p>
                  )}

                  {a.resource_url && (
                    <a
                      href={a.resource_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"
                    >
                      📎 Ver recurso adjunto ↗
                    </a>
                  )}
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="text-slate-500">
                    📅 Fecha límite: {a.due_date ? formatDateTime(a.due_date) : "Sin fecha"}
                  </span>

                  {!isStaff ? (
                    <Button
                      variant={studentSub ? "secondary" : "primary"}
                      onClick={() => {
                        setSubmittingAssignment(a);
                        setSubContent(studentSub?.content || "");
                        setSubUrl(studentSub?.submission_url || "");
                      }}
                    >
                      {studentSub ? "Ver / Editar entrega" : "Entregar"}
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setManagingAssignment(a);
                        setSubFilterTab("todos");
                        setSubSearch("");
                      }}
                    >
                      Revisar Entregas ({subs.length} / {roster.length})
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Modal: Crear Tarea */}
      {showCreate && (
        <Modal
          title="Crear nueva tarea"
          description="Los alumnos del curso la verán en cuanto la asignes."
          onClose={() => setShowCreate(false)}
          onSubmit={handleCreateAssignment}
          maxWidth="max-w-xl"
          footer={
            <ModalActions>
              <Button variant="secondary" onClick={() => setShowCreate(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving || !newTitle.trim()}>
                {saving ? "Asignando…" : "Asignar tarea"}
              </Button>
            </ModalActions>
          }
        >
          <div className="space-y-4">
            <Field label="Curso" required={true}>
              <Select
                value={newCourseId}
                onChange={(e) => setNewCourseId(Number(e.target.value))}
              >
                {safeCourses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Título de la tarea" required={true}>
              <Input
                placeholder="Ej. Taller práctico 1: Vocabulario básico"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
              />
            </Field>

            <Field label="Instrucciones">
              <textarea
                rows={3}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                placeholder="Detalla las instrucciones para los alumnos…"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
              />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="URL de recurso (opcional)">
                <Input
                  placeholder="Ej. https://drive.google.com/..."
                  value={newResourceUrl}
                  onChange={(e) => setNewResourceUrl(e.target.value)}
                />
              </Field>

              <Field label="Fecha y hora límite" required={true}>
                <Input
                  type="datetime-local"
                  value={newDueDate}
                  onChange={(e) => setNewDueDate(e.target.value)}
                />
              </Field>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal: Entregar Tarea (Student) */}
      {submittingAssignment && (
        <Modal
          title="Entregar tarea"
          description={submittingAssignment.title}
          onClose={() => setSubmittingAssignment(null)}
          onSubmit={handleSubmitWork}
          maxWidth="max-w-xl"
          footer={
            <ModalActions hint="Basta con un texto o un enlace.">
              <Button variant="secondary" onClick={() => setSubmittingAssignment(null)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving || (!subContent && !subUrl)}>
                {saving ? "Enviando…" : "Enviar entrega"}
              </Button>
            </ModalActions>
          }
        >
          <div className="space-y-4">
            <Field label="Respuesta / Explicación">
              <textarea
                rows={4}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                placeholder="Escribe tu respuesta o resumen del trabajo…"
                value={subContent}
                onChange={(e) => setSubContent(e.target.value)}
              />
            </Field>
            <Field label="Enlace del trabajo (Drive, GitHub, Figma, etc.)">
              <Input
                placeholder="Ej. https://github.com/..."
                value={subUrl}
                onChange={(e) => setSubUrl(e.target.value)}
              />
            </Field>
          </div>
        </Modal>
      )}

      {/* Modal: Calificar Entrega (Teacher) */}
      {gradingStudentStatus && (
        <Modal
          title={`Calificar a ${gradingStudentStatus.student.full_name}`}
          description={gradingStudentStatus.assignment.title}
          onClose={() => setGradingStudentStatus(null)}
          onSubmit={handleGradeSubmission}
          maxWidth="max-w-xl"
          footer={
            <ModalActions>
              <Button variant="secondary" onClick={() => setGradingStudentStatus(null)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Guardando…" : "Guardar calificación"}
              </Button>
            </ModalActions>
          }
        >
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 text-xs space-y-1.5">
              <div><strong className="text-slate-700">Tarea:</strong> {gradingStudentStatus.assignment.title}</div>
              {gradingStudentStatus.student.content && (
                <div><strong className="text-slate-700">Respuesta del Alumno:</strong> {gradingStudentStatus.student.content}</div>
              )}
              {gradingStudentStatus.student.submission_url && (
                <div>
                  <strong className="text-slate-700">Enlace adjunto:</strong>{" "}
                  <a
                    href={gradingStudentStatus.student.submission_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-600 hover:underline font-medium"
                  >
                    Ver archivo / entregable ↗
                  </a>
                </div>
              )}
            </div>

            <Field label="Nota (0 a 10)" required={true}>
              <Input
                type="number"
                min={0}
                max={10}
                step={0.5}
                value={gradeScore}
                onChange={(e) => setGradeScore(Number(e.target.value))}
              />
            </Field>

            <Field label="Retroalimentación / Comentarios">
              <textarea
                rows={3}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                placeholder="Comentarios para el alumno…"
                value={gradeFeedback}
                onChange={(e) => setGradeFeedback(e.target.value)}
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {QUICK_FEEDBACK_TAGS.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setGradeFeedback(tag)}
                    className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 transition"
                  >
                    + {tag}
                  </button>
                ))}
              </div>
            </Field>
          </div>
        </Modal>
      )}

      {/* Modal: Gestionar Entregas por Tarea (Teacher/Staff Hub) */}
      {managingAssignment && (
        <Modal
          title={`Libro de Entregas · ${managingAssignment.title}`}
          description={`Curso: ${safeCourses.find((c) => c.id === managingAssignment.course_id)?.name || "Curso"} • Fecha límite: ${managingAssignment.due_date ? formatDateTime(managingAssignment.due_date) : "Sin fecha"}`}
          onClose={() => setManagingAssignment(null)}
          maxWidth="max-w-4xl"
          footer={
            <ModalActions>
              <Button variant="secondary" onClick={() => setManagingAssignment(null)}>
                Cerrar
              </Button>
            </ModalActions>
          }
        >
          {(() => {
            const roster = rosterMap[managingAssignment.id] || [];
            const submittedCount = roster.filter((r) => r.status === "submitted" || r.status === "submitted_late" || r.status === "graded").length;
            const gradedCount = roster.filter((r) => r.status === "graded").length;
            const pendingGradeCount = roster.filter((r) => r.status === "submitted" || r.status === "submitted_late").length;
            const unsubmittedCount = roster.filter((r) => r.status === "not_submitted").length;

            const filteredRoster = roster.filter((st) => {
              const matchesSearch = subSearch.trim() === "" || st.full_name.toLowerCase().includes(subSearch.toLowerCase());
              if (!matchesSearch) return false;
              if (subFilterTab === "pending_grade") return st.status === "submitted" || st.status === "submitted_late";
              if (subFilterTab === "graded") return st.status === "graded";
              if (subFilterTab === "unsubmitted") return st.status === "not_submitted";
              return true;
            });

            return (
              <div className="space-y-4">
                {/* Metric Summary */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-2.5 text-center">
                    <div className="text-[11px] text-slate-500 font-medium">Total Alumnos</div>
                    <div className="text-lg font-bold text-slate-900">{roster.length}</div>
                  </div>
                  <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-2.5 text-center">
                    <div className="text-[11px] text-indigo-700 font-medium">Entregados</div>
                    <div className="text-lg font-bold text-indigo-900">{submittedCount}</div>
                  </div>
                  <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-2.5 text-center">
                    <div className="text-[11px] text-amber-700 font-medium">Por Calificar</div>
                    <div className="text-lg font-bold text-amber-900">{pendingGradeCount}</div>
                  </div>
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-2.5 text-center">
                    <div className="text-[11px] text-emerald-700 font-medium">Calificados</div>
                    <div className="text-lg font-bold text-emerald-900">{gradedCount}</div>
                  </div>
                </div>

                {/* Toolbar Filter & Search */}
                <Toolbar>
                  <SegmentedControl
                    value={subFilterTab}
                    onChange={(v) => setSubFilterTab(v)}
                    options={[
                      { value: "todos", label: "Todos", count: roster.length },
                      { value: "pending_grade", label: "Por Calificar", count: pendingGradeCount },
                      { value: "graded", label: "Calificados", count: gradedCount },
                      { value: "unsubmitted", label: "Sin Entregar", count: unsubmittedCount },
                    ]}
                  />
                  <SearchInput
                    className="w-full sm:ml-auto sm:w-64"
                    placeholder="Buscar alumno..."
                    value={subSearch}
                    onChange={(e) => setSubSearch(e.target.value)}
                  />
                </Toolbar>

                {/* Roster Table */}
                <div className="max-h-96 overflow-y-auto rounded-xl border border-slate-200">
                  <Table>
                    <thead>
                      <tr>
                        <Th>Alumno</Th>
                        <Th>Estado</Th>
                        <Th>Entregable / Enlace</Th>
                        <Th align="right">Nota</Th>
                        <Th align="right">Acción</Th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredRoster.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-8 text-center text-xs text-slate-400">
                            Ningún alumno coincide con los criterios de búsqueda.
                          </td>
                        </tr>
                      ) : (
                        filteredRoster.map((st) => (
                          <tr key={st.student_id} className="hover:bg-slate-50">
                            <Td>
                              <span className="font-semibold text-slate-900">{st.full_name}</span>
                            </Td>
                            <Td>
                              {st.status === "graded" ? (
                                <Badge color="green">Calificado</Badge>
                              ) : st.status === "submitted" || st.status === "submitted_late" ? (
                                <Badge color={st.is_late ? "amber" : "indigo"}>
                                  {st.is_late ? "Con retraso" : "Entregado"}
                                </Badge>
                              ) : (
                                <Badge color="slate">Sin entregar</Badge>
                              )}
                            </Td>
                            <Td>
                              {st.submission_url ? (
                                <a
                                  href={st.submission_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs font-medium text-brand-600 hover:underline"
                                >
                                  Ver recurso ↗
                                </a>
                              ) : st.content ? (
                                <span className="text-xs text-slate-600 line-clamp-1">{st.content}</span>
                              ) : (
                                <span className="text-xs text-slate-400">—</span>
                              )}
                            </Td>
                            <Td align="right">
                              {st.score !== null && st.score !== undefined ? (
                                <span className="font-bold text-slate-900 tabular">{st.score} / 10</span>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </Td>
                            <Td align="right">
                              {st.submission_id ? (
                                <Button
                                  variant={st.status === "graded" ? "secondary" : "primary"}
                                  onClick={() => {
                                    setGradingStudentStatus({ assignment: managingAssignment, student: st });
                                    setGradeScore(st.score ?? 10);
                                    setGradeFeedback(st.feedback || "");
                                  }}
                                >
                                  {st.status === "graded" ? "Editar nota" : "Calificar"}
                                </Button>
                              ) : (
                                <span className="text-xs text-slate-400">Pendiente</span>
                              )}
                            </Td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </Table>
                </div>
              </div>
            );
          })()}
        </Modal>
      )}
    </div>
  );
}
