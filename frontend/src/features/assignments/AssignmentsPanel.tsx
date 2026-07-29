import { useEffect, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { Badge, Button, Card, Input, Modal, ModalActions, Select } from "../../components/ui";
import { api, apiErrorMessage } from "../../lib/api";
import { formatDateTime } from "../../lib/format";
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

  const isStaff = user?.role === "admin" || user?.role === "teacher";

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

      const subsMap: Record<number, AssignmentSubmission[]> = {};
      const rosMap: Record<number, RosterStudentStatus[]> = {};

      for (const a of loadedAssignments) {
        try {
          const sRes = await api.get<AssignmentSubmission[]>(`/assignments/${a.id}/submissions`);
          subsMap[a.id] = Array.isArray(sRes.data) ? sRes.data : [];
        } catch {
          subsMap[a.id] = [];
        }

        if (isStaff) {
          try {
            const rRes = await api.get<RosterStudentStatus[]>(`/assignments/${a.id}/roster-status`);
            rosMap[a.id] = Array.isArray(rRes.data) ? rRes.data : [];
          } catch {
            rosMap[a.id] = [];
          }
        }
      }
      setSubmissions(subsMap);
      setRosterMap(rosMap);
    } catch (err) {
      notify(apiErrorMessage(err, "Error al cargar tareas"), "error");
    }
  }

  useEffect(() => {
    loadData();
  }, []);

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
      {/* Metrics & Action Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="grid grid-cols-3 gap-3">
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

        {isStaff && (
          <Button onClick={() => setShowCreate(true)}>
            + Nueva Tarea
          </Button>
        )}
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

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                  <span>
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
                    <span className="font-medium text-slate-700">
                      Entregas: {subs.length} / {roster.length}
                    </span>
                  )}
                </div>

                {/* Staff Roster Grid (Docentes) */}
                {isStaff && roster.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Estado de alumnos ({roster.length}):
                    </div>
                    <div className="grid grid-cols-1 gap-1.5 max-h-36 overflow-y-auto">
                      {roster.map((st) => (
                        <div
                          key={st.student_id}
                          className="flex items-center justify-between rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs"
                        >
                          <span className="font-medium text-slate-800">{st.full_name}</span>
                          <div className="flex items-center gap-2">
                            {st.status === "graded" ? (
                              <Badge color="green">{st.score}/10</Badge>
                            ) : st.status === "submitted" || st.status === "submitted_late" ? (
                              <Badge color={st.is_late ? "amber" : "indigo"}>
                                {st.is_late ? "Con retraso" : "Entregado"}
                              </Badge>
                            ) : (
                              <Badge color="slate">Sin entregar</Badge>
                            )}

                            {st.submission_id && (
                              <Button
                                variant="ghost"
                                className="!py-0.5 !px-2 text-xs"
                                onClick={() => {
                                  setGradingStudentStatus({ assignment: a, student: st });
                                  setGradeScore(st.score ?? 10);
                                  setGradeFeedback(st.feedback || "");
                                }}
                              >
                                {st.status === "graded" ? "Editar nota" : "Calificar"}
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
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
            <div>
              <label className="block text-sm font-medium text-slate-700">Curso</label>
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
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Título de la tarea</label>
              <Input
                placeholder="Ej. Taller práctico 1: Vocabulario básico"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Instrucciones</label>
              <textarea
                rows={3}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brand-500 focus:bg-white"
                placeholder="Detalla las instrucciones para los alumnos…"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">URL de recurso (opcional)</label>
              <Input
                placeholder="Ej. https://drive.google.com/..."
                value={newResourceUrl}
                onChange={(e) => setNewResourceUrl(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Fecha y hora límite</label>
              <Input
                type="datetime-local"
                value={newDueDate}
                onChange={(e) => setNewDueDate(e.target.value)}
              />
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
            <div>
              <label className="block text-sm font-medium text-slate-700">Respuesta / Explicación</label>
              <textarea
                rows={4}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brand-500 focus:bg-white"
                placeholder="Escribe tu respuesta o resumen del trabajo…"
                value={subContent}
                onChange={(e) => setSubContent(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Enlace del trabajo (Drive, GitHub, Figma, etc.)</label>
              <Input
                placeholder="Ej. https://github.com/..."
                value={subUrl}
                onChange={(e) => setSubUrl(e.target.value)}
              />
            </div>

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
            <div className="rounded-lg bg-slate-50 p-3 text-xs space-y-1">
              <div><strong>Tarea:</strong> {gradingStudentStatus.assignment.title}</div>
              {gradingStudentStatus.student.content && (
                <div><strong>Respuesta:</strong> {gradingStudentStatus.student.content}</div>
              )}
              {gradingStudentStatus.student.submission_url && (
                <div>
                  <strong>Enlace:</strong>{" "}
                  <a
                    href={gradingStudentStatus.student.submission_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-600 underline"
                  >
                    Ver archivo ↗
                  </a>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">Nota (0 a 10)</label>
              <Input
                type="number"
                min={0}
                max={10}
                step={0.5}
                value={gradeScore}
                onChange={(e) => setGradeScore(Number(e.target.value))}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">Retroalimentación / Comentarios</label>
              <textarea
                rows={3}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brand-500 focus:bg-white"
                placeholder="Comentarios para el alumno…"
                value={gradeFeedback}
                onChange={(e) => setGradeFeedback(e.target.value)}
              />
              <div className="mt-2 flex flex-wrap gap-1">
                {QUICK_FEEDBACK_TAGS.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setGradeFeedback(tag)}
                    className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:bg-brand-50 hover:text-brand-700 transition"
                  >
                    + {tag}
                  </button>
                ))}
              </div>
            </div>

          </div>
        </Modal>
      )}
    </div>
  );
}
