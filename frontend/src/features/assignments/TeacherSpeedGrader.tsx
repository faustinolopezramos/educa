import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Field, Input, Modal, ModalActions } from "../../components/ui";
import { api, apiErrorMessage } from "../../lib/api";
import { formatDateTime } from "../../lib/format";
import { notify } from "../../lib/toast";
import type { Assignment, Course, RosterStudentStatus } from "../../lib/types";

const QUICK_FEEDBACK_TAGS = [
  "¡Excelente trabajo! 👏",
  "Buen análisis, cuida los detalles.",
  "Entregado a tiempo. Buen esfuerzo.",
  "Requiere profundizar en las conclusiones.",
  "Revisa la ortografía y redacción.",
  "Argumentación clara y concisa.",
];

const isSafeWebUrl = (url: string) => /^https?:\/\//i.test(url.trim());

interface TeacherSpeedGraderProps {
  assignment: Assignment;
  course?: Course;
  roster: RosterStudentStatus[];
  initialStudentIndex?: number;
  onClose: () => void;
  onGraded: () => void;
}

export function TeacherSpeedGrader({
  assignment,
  course,
  roster,
  initialStudentIndex = 0,
  onClose,
  onGraded,
}: TeacherSpeedGraderProps) {
  const [filter, setFilter] = useState<"all" | "pending" | "graded" | "unsubmitted">("pending");
  const [search, setSearch] = useState("");
  const [currentIndex, setCurrentIndex] = useState(initialStudentIndex);
  const [score, setScore] = useState<number>(10);
  const [feedback, setFeedback] = useState<string>("");
  const [saving, setSaving] = useState(false);

  // Filter roster according to selected tab and search query
  const filteredStudents = useMemo(() => {
    return roster.filter((s) => {
      const matchSearch =
        !search.trim() || s.full_name.toLowerCase().includes(search.toLowerCase());
      if (!matchSearch) return false;

      if (filter === "pending") {
        return s.status === "submitted" || s.status === "submitted_late";
      }
      if (filter === "graded") {
        return s.status === "graded";
      }
      if (filter === "unsubmitted") {
        return s.status === "not_submitted";
      }
      return true;
    });
  }, [roster, filter, search]);

  // Ensure currentIndex stays within bounds of filtered list
  const activeStudent: RosterStudentStatus | undefined =
    filteredStudents[currentIndex] || filteredStudents[0];

  // Sync inputs when active student changes
  useEffect(() => {
    if (activeStudent) {
      setScore(activeStudent.score !== null && activeStudent.score !== undefined ? activeStudent.score : 10);
      setFeedback(activeStudent.feedback || "");
    }
  }, [activeStudent?.student_id]);

  // Global keyboard shortcuts: Cmd+Enter to save & advance, ArrowLeft / ArrowRight to navigate
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        handleSaveGrade(true);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  const totalSubmitted = roster.filter(
    (s) => s.status === "submitted" || s.status === "submitted_late" || s.status === "graded"
  ).length;
  const totalGraded = roster.filter((s) => s.status === "graded").length;
  const totalPending = roster.filter(
    (s) => s.status === "submitted" || s.status === "submitted_late"
  ).length;

  async function handleSaveGrade(advanceToNext = false) {
    if (!activeStudent || !activeStudent.submission_id) {
      if (advanceToNext && currentIndex < filteredStudents.length - 1) {
        setCurrentIndex((i) => i + 1);
      }
      return;
    }

    setSaving(true);
    try {
      await api.patch(`/assignments/submissions/${activeStudent.submission_id}`, {
        score: Number(score),
        feedback: feedback.trim() || null,
      });

      notify(`Nota guardada para ${activeStudent.full_name}`, "success");
      onGraded();

      if (advanceToNext) {
        if (currentIndex < filteredStudents.length - 1) {
          setCurrentIndex((prev) => prev + 1);
        } else {
          notify("Has llegado al final de la lista.", "info");
        }
      }
    } catch (err) {
      notify(apiErrorMessage(err, "Error al calificar al alumno"), "error");
    } finally {
      setSaving(false);
    }
  }

  function handleSelectStudent(idx: number) {
    setCurrentIndex(idx);
  }

  return (
    <Modal
      title="SpeedGrader · Revisión de Entregas"
      description={`${assignment.title} · ${course?.name || "Curso"}`}
      onClose={onClose}
      maxWidth="max-w-5xl"
      footer={
        <ModalActions hint="Tip: Presiona ⌘ + Enter (o Ctrl + Enter) para guardar y avanzar automáticamente">
          <Button variant="secondary" onClick={onClose}>
            Cerrar
          </Button>
          {activeStudent?.submission_id && (
            <>
              <Button
                variant="secondary"
                onClick={() => handleSaveGrade(false)}
                disabled={saving}
              >
                {saving ? "Guardando…" : "Guardar Nota"}
              </Button>
              <Button
                onClick={() => handleSaveGrade(true)}
                disabled={saving}
              >
                Guardar y Siguiente →
              </Button>
            </>
          )}
        </ModalActions>
      }
    >
      <div className="space-y-4">
        {/* Top bar with quick filters and metrics */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-1.5 rounded-lg bg-slate-100 p-1 text-xs font-semibold">
            <button
              onClick={() => {
                setFilter("pending");
                setCurrentIndex(0);
              }}
              className={`rounded-md px-3 py-1 transition ${
                filter === "pending"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              ⚡ Por Calificar ({totalPending})
            </button>
            <button
              onClick={() => {
                setFilter("graded");
                setCurrentIndex(0);
              }}
              className={`rounded-md px-3 py-1 transition ${
                filter === "graded"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              ✅ Calificados ({totalGraded})
            </button>
            <button
              onClick={() => {
                setFilter("all");
                setCurrentIndex(0);
              }}
              className={`rounded-md px-3 py-1 transition ${
                filter === "all"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Todos ({roster.length})
            </button>
            <button
              onClick={() => {
                setFilter("unsubmitted");
                setCurrentIndex(0);
              }}
              className={`rounded-md px-3 py-1 transition ${
                filter === "unsubmitted"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Sin entregar ({roster.length - totalSubmitted})
            </button>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="text"
              placeholder="Buscar estudiante..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentIndex(0);
              }}
              className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-800 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none"
            />
            <span className="text-xs text-slate-500 font-medium">
              {totalGraded}/{roster.length} calificados ({roster.length > 0 ? Math.round((totalGraded / roster.length) * 100) : 0}%)
            </span>
          </div>
        </div>

        {/* Student Navigation Strip */}
        {filteredStudents.length > 0 && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200/80 bg-slate-50/60 px-3 py-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={currentIndex <= 0}
              onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
            >
              ← Anterior
            </Button>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Estudiante:</span>
              <select
                className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-800 shadow-2xs focus:border-brand-500 focus:outline-none"
                value={currentIndex}
                onChange={(e) => handleSelectStudent(Number(e.target.value))}
              >
                {filteredStudents.map((st, idx) => (
                  <option key={st.student_id} value={idx}>
                    {idx + 1}. {st.full_name} ({st.status === "graded" ? `✓ ${st.score}/10` : st.status === "not_submitted" ? "Sin entrega" : "Pendiente"})
                  </option>
                ))}
              </select>
              <span className="text-xs text-slate-400">
                de {filteredStudents.length}
              </span>
            </div>

            <Button
              size="sm"
              variant="secondary"
              disabled={currentIndex >= filteredStudents.length - 1}
              onClick={() => setCurrentIndex((i) => Math.min(filteredStudents.length - 1, i + 1))}
            >
              Siguiente →
            </Button>
          </div>
        )}

        {/* Focus Mode Split Workspace */}
        {!activeStudent ? (
          <div className="py-12 text-center text-sm text-slate-400">
            No hay alumnos en la categoría seleccionada.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-5 min-h-[380px]">
            {/* Left 7 cols: Deliverable Viewer */}
            <div className="md:col-span-7 flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">
                      {activeStudent.full_name}
                    </h3>
                    <div className="text-xs text-slate-500">
                      {activeStudent.submitted_at
                        ? `Entregado el ${formatDateTime(activeStudent.submitted_at)}`
                        : "Aún no ha realizado su entrega"}
                    </div>
                  </div>
                  <div>
                    {activeStudent.status === "graded" ? (
                      <Badge color="green">Calificado ({activeStudent.score}/10)</Badge>
                    ) : activeStudent.status === "submitted_late" ? (
                      <Badge color="amber">Entregado con retraso</Badge>
                    ) : activeStudent.status === "submitted" ? (
                      <Badge color="indigo">Entregado a tiempo</Badge>
                    ) : (
                      <Badge color="slate">Sin entregar</Badge>
                    )}
                  </div>
                </div>

                {/* Submission Content */}
                {activeStudent.content ? (
                  <div className="space-y-1.5">
                    <span className="text-2xs font-semibold uppercase tracking-wider text-slate-500">
                      Respuesta del Alumno
                    </span>
                    <div className="rounded-lg bg-slate-50 p-3.5 text-xs text-slate-800 leading-relaxed border border-slate-100 whitespace-pre-wrap max-h-56 overflow-y-auto">
                      {activeStudent.content}
                    </div>
                  </div>
                ) : null}

                {/* Submission Link / Document */}
                {activeStudent.submission_url ? (
                  <div className="rounded-lg border border-brand-100 bg-brand-50/50 p-3.5 text-xs flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white font-bold text-xs shrink-0">
                        📄
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-brand-900 truncate">
                          {activeStudent.submission_url.startsWith("attachment://")
                            ? decodeURIComponent(activeStudent.submission_url.replace("attachment://", ""))
                            : "Entregable adjunto / Enlace"}
                        </div>
                        <div className="text-2xs text-brand-700 truncate max-w-xs">
                          {activeStudent.submission_url}
                        </div>
                      </div>
                    </div>
                    {activeStudent.submission_url.startsWith("attachment://") ? (
                      <span className="rounded-md bg-brand-100 px-2.5 py-1 text-2xs font-semibold text-brand-800 whitespace-nowrap">
                        ✓ Archivo Registrado
                      </span>
                    ) : isSafeWebUrl(activeStudent.submission_url) ? (
                      <a
                        href={activeStudent.submission_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 transition whitespace-nowrap"
                      >
                        Abrir Enlace ↗
                      </a>
                    ) : (
                      <span className="rounded-md bg-amber-100 px-2.5 py-1 text-2xs font-semibold text-amber-800 whitespace-nowrap" title="El enlace proporcionado no es seguro">
                        ⚠️ Enlace no seguro
                      </span>
                    )}
                  </div>
                ) : null}

                {!activeStudent.content && !activeStudent.submission_url && (
                  <div className="py-10 text-center text-xs text-slate-400">
                    El alumno no ha registrado contenido ni enlaces para esta tarea.
                  </div>
                )}
              </div>

              {/* Assignment context footer */}
              <div className="mt-4 pt-3 border-t border-slate-100 text-2xs text-slate-500 flex justify-between">
                <span>Tarea: {assignment.title}</span>
                <span>Límite: {assignment.due_date ? formatDateTime(assignment.due_date) : "Sin fecha"}</span>
              </div>
            </div>

            {/* Right 5 cols: Grading Form */}
            <div className="md:col-span-5 flex flex-col justify-between rounded-xl border border-slate-200 bg-slate-50/60 p-4 shadow-2xs">
              <div className="space-y-4">
                <div className="border-b border-slate-200 pb-2.5">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Evaluación y Feedback
                  </h4>
                </div>

                <Field label="Calificación (Escala 0 a 10)" required>
                  <div className="flex items-center gap-3">
                    <Input
                      type="number"
                      min={0}
                      max={10}
                      step={0.5}
                      className="w-28 text-center text-lg font-bold"
                      value={score}
                      onChange={(e) => setScore(Number(e.target.value))}
                      disabled={saving || !activeStudent.submission_id}
                    />
                    <div className="text-xs text-slate-500">
                      {score >= 9 ? "🌟 Excelente" : score >= 7 ? "👍 Aprobado" : "⚠️ Por mejorar"}
                    </div>
                  </div>
                </Field>

                <Field label="Comentario Pedagógico">
                  <textarea
                    rows={4}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 disabled:bg-slate-100"
                    placeholder="Escribe comentarios constructivos sobre su trabajo…"
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    disabled={saving || !activeStudent.submission_id}
                  />

                  {/* Fast feedback chips */}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {QUICK_FEEDBACK_TAGS.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() =>
                          setFeedback((prev) => (prev ? `${prev} ${tag}` : tag))
                        }
                        disabled={saving || !activeStudent.submission_id}
                        className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-2xs text-slate-600 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 transition disabled:opacity-50"
                      >
                        + {tag}
                      </button>
                    ))}
                  </div>
                </Field>
              </div>

              {!activeStudent.submission_id && (
                <div className="mt-4 rounded-lg bg-amber-50 p-2.5 text-center text-xs text-amber-800 border border-amber-200">
                  El estudiante aún no tiene un registro de entrega para calificar.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
