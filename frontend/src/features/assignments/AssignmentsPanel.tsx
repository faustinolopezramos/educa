import { useEffect, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import {
  Badge,
  Button,
  Card,
  PageHeader,
  Select,
} from "../../components/ui";
import { api, apiErrorMessage } from "../../lib/api";
import { formatDateTime } from "../../lib/format";
import { canManageGrades } from "../../lib/nav";
import { notify } from "../../lib/toast";
import type {
  Assignment,
  AssignmentSubmission,
  Course,
  RosterStudentStatus,
} from "../../lib/types";
import { TeacherAssignmentModal } from "./TeacherAssignmentModal";
import { TeacherSpeedGrader } from "./TeacherSpeedGrader";
import { StudentAssignmentModal } from "./StudentAssignmentModal";

export function AssignmentsPanel() {
  const { user } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [submissions, setSubmissions] = useState<Record<number, AssignmentSubmission[]>>({});
  const [rosterMap, setRosterMap] = useState<Record<number, RosterStudentStatus[]>>({});
  const [selectedCourseId, setSelectedCourseId] = useState<number | "all">("all");
  const [filterTab, setFilterTab] = useState<"all" | "pending" | "submitted" | "graded">("all");

  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [speedGraderAssignment, setSpeedGraderAssignment] = useState<Assignment | null>(null);
  const [studentActiveAssignment, setStudentActiveAssignment] = useState<Assignment | null>(null);

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

      const subsMap: Record<number, AssignmentSubmission[]> = {};
      const rosMap: Record<number, RosterStudentStatus[]> = {};

      async function loadOne<T>(url: string): Promise<T[]> {
        try {
          const res = await api.get<T[]>(url);
          return Array.isArray(res.data) ? res.data : [];
        } catch {
          return [];
        }
      }

      await Promise.all(
        loadedAssignments.flatMap((a) => [
          loadOne<AssignmentSubmission>(`/assignments/${a.id}/submissions`).then(
            (rows) => {
              subsMap[a.id] = rows;
            }
          ),
          ...(isStaff
            ? [
                loadOne<RosterStudentStatus>(
                  `/assignments/${a.id}/roster-status`
                ).then((rows) => {
                  rosMap[a.id] = rows;
                }),
              ]
            : []),
        ])
      );
      setSubmissions(subsMap);
      setRosterMap(rosMap);
    } catch (err) {
      notify(apiErrorMessage(err, "Error al cargar las tareas"), "error");
    }
  }

  const safeAssignments = Array.isArray(assignments) ? assignments : [];
  const safeCourses = Array.isArray(courses) ? courses : [];

  // Filter assignments based on course and tab
  const filteredAssignments = safeAssignments.filter((a) => {
    if (selectedCourseId !== "all" && a.course_id !== selectedCourseId) return false;
    const subs = submissions[a.id] || [];
    const studentSub = subs.find((s) => s.student_id === user?.id);

    if (isStaff) {
      const pendingGradingCount = subs.filter((s) => s.status !== "graded").length;
      if (filterTab === "pending") return pendingGradingCount > 0;
      if (filterTab === "graded") return subs.length > 0 && pendingGradingCount === 0;
    } else {
      if (filterTab === "pending") return !studentSub;
      if (filterTab === "submitted") return studentSub && studentSub.status !== "graded";
      if (filterTab === "graded") return studentSub && studentSub.status === "graded";
    }
    return true;
  });

  // Calculate Metrics
  const totalCount = safeAssignments.length;
  const pendingCount = safeAssignments.filter((a) => {
    const subs = submissions[a.id] || [];
    const studentSub = subs.find((s) => s.student_id === user?.id);
    if (isStaff) {
      return subs.some((s) => s.status !== "graded");
    }
    return !studentSub;
  }).length;

  const completedCount = safeAssignments.filter((a) => {
    const subs = submissions[a.id] || [];
    const studentSub = subs.find((s) => s.student_id === user?.id);
    if (isStaff) {
      return subs.length > 0 && subs.every((s) => s.status === "graded");
    }
    return studentSub && studentSub.status === "graded";
  }).length;

  function getDeadlineBadge(assignment: Assignment, studentSub?: AssignmentSubmission) {
    if (!isStaff && studentSub) {
      if (studentSub.status === "graded") {
        return <Badge color="green">Calificada ({studentSub.score}/10)</Badge>;
      }
      if (studentSub.is_late) {
        return <Badge color="amber">Entregada fuera de plazo</Badge>;
      }
      return <Badge color="indigo">Entregada a tiempo</Badge>;
    }

    if (!assignment.due_date) {
      return <Badge color="slate">Sin fecha límite</Badge>;
    }

    const now = Date.now();
    const due = new Date(assignment.due_date).getTime();
    const diffHours = (due - now) / (1000 * 3600);

    if (diffHours < 0) {
      return <Badge color="red">Vencida</Badge>;
    }
    if (diffHours <= 24) {
      return <Badge color="amber">Vence hoy</Badge>;
    }
    if (diffHours <= 72) {
      const days = Math.ceil(diffHours / 24);
      return <Badge color="indigo">Vence en {days} días</Badge>;
    }
    return <Badge color="slate">En plazo</Badge>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tareas y Evaluaciones"
        description={
          isStaff
            ? "Publica actividades, califica ágilmente en modo SpeedGrader y proporciona retroalimentación formativa."
            : "Consulta tus asignaciones pendientes, entrega tus trabajos y revisa el feedback de tus profesores."
        }
        actions={
          isStaff ? (
            <Button onClick={() => setShowCreateModal(true)}>
              + Nueva Tarea
            </Button>
          ) : undefined
        }
      />

      {/* Metrics Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-slate-200/80 bg-white px-4 py-3 shadow-2xs">
          <div className="text-2xs font-semibold uppercase tracking-wider text-slate-500">
            Total Asignaciones
          </div>
          <div className="mt-0.5 text-2xl font-bold text-slate-900">{totalCount}</div>
        </div>
        <div className="rounded-xl border border-amber-200/60 bg-amber-50/40 px-4 py-3 shadow-2xs">
          <div className="text-2xs font-semibold uppercase tracking-wider text-amber-700">
            {isStaff ? "Tareas con Entregas por Calificar" : "Tareas Pendientes de Entrega"}
          </div>
          <div className="mt-0.5 text-2xl font-bold text-amber-900">{pendingCount}</div>
        </div>
        <div className="rounded-xl border border-emerald-200/60 bg-emerald-50/40 px-4 py-3 shadow-2xs">
          <div className="text-2xs font-semibold uppercase tracking-wider text-emerald-700">
            {isStaff ? "Tareas Completamente Calificadas" : "Tareas Evaluadas con Nota"}
          </div>
          <div className="mt-0.5 text-2xl font-bold text-emerald-900">{completedCount}</div>
        </div>
      </div>

      {/* Filter and Course Selection Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-2.5 shadow-2xs">
        <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
          <button
            onClick={() => setFilterTab("all")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              filterTab === "all"
                ? "bg-white text-slate-900 shadow-2xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Todas ({totalCount})
          </button>
          <button
            onClick={() => setFilterTab("pending")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              filterTab === "pending"
                ? "bg-white text-slate-900 shadow-2xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            ⚡ {isStaff ? "Por Calificar" : "Pendientes"} ({pendingCount})
          </button>
          {!isStaff && (
            <button
              onClick={() => setFilterTab("submitted")}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                filterTab === "submitted"
                  ? "bg-white text-slate-900 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              📤 Entregadas
            </button>
          )}
          <button
            onClick={() => setFilterTab("graded")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              filterTab === "graded"
                ? "bg-white text-slate-900 shadow-2xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            ✅ Calificadas ({completedCount})
          </button>
        </div>

        <Select
          className="max-w-xs text-xs"
          value={selectedCourseId}
          onChange={(e) =>
            setSelectedCourseId(e.target.value === "all" ? "all" : Number(e.target.value))
          }
        >
          <option value="all">Todos los cursos</option>
          {safeCourses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>

      {/* Assignments Grid */}
      {filteredAssignments.length === 0 ? (
        <Card className="py-12 text-center text-sm text-slate-400">
          No hay asignaciones para mostrar en este filtro.
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filteredAssignments.map((a) => {
            const course = safeCourses.find((c) => c.id === a.course_id);
            const subs = submissions[a.id] || [];
            const studentSub = subs.find((s) => s.student_id === user?.id);
            const roster = rosterMap[a.id] || [];
            const pendingGradingCount = isStaff
              ? subs.filter((s) => s.status !== "graded").length
              : 0;
            const isGraded = studentSub?.status === "graded";

            return (
              <Card
                key={a.id}
                className="flex flex-col justify-between transition-all hover:border-slate-300 hover:shadow-sm"
              >
                <div className="space-y-3">
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-2xs font-bold uppercase tracking-wider text-brand-700">
                        {course?.name || "Curso"}
                      </span>
                      <h3 className="text-base font-semibold text-slate-900 mt-0.5 leading-snug">
                        {a.title}
                      </h3>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {getDeadlineBadge(a, studentSub)}
                      {isStaff && pendingGradingCount > 0 && (
                        <Badge color="amber">
                          {pendingGradingCount} por revisar
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Excerpt Instructions */}
                  {a.description && (
                    <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                      {a.description}
                    </p>
                  )}

                  {/* Resource Attachment */}
                  {a.resource_url && (
                    <a
                      href={a.resource_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"
                    >
                      📎 Documento o recurso adjunto ↗
                    </a>
                  )}

                  {/* Teacher Progress Bar */}
                  {isStaff && (
                    <div className="rounded-lg bg-slate-50 p-2.5 border border-slate-100 text-xs space-y-1.5">
                      <div className="flex items-center justify-between font-medium text-slate-700">
                        <span>Entregas recibidas:</span>
                        <span className="font-bold text-slate-900">
                          {subs.length} / {roster.length} estudiantes (
                          {roster.length > 0 ? Math.round((subs.length / roster.length) * 100) : 0}%)
                        </span>
                      </div>
                      <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-brand-500 rounded-full transition-all"
                          style={{
                            width: `${
                              roster.length > 0
                                ? Math.min(100, (subs.length / roster.length) * 100)
                                : 0
                            }%`,
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Student Graded Feedback Highlight */}
                  {!isStaff && isGraded && studentSub && (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 text-xs space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-emerald-900">
                          Calificación: {studentSub.score} / 10
                        </span>
                        <span className="text-2xs font-semibold text-emerald-700 uppercase tracking-wider">
                          Revisado
                        </span>
                      </div>
                      {studentSub.feedback && (
                        <p className="text-emerald-950 italic line-clamp-2 leading-relaxed">
                          “{studentSub.feedback}”
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Card Footer */}
                <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="text-slate-500 font-medium">
                    📅 {a.due_date ? formatDateTime(a.due_date) : "Sin fecha límite"}
                  </span>

                  {!isStaff ? (
                    <Button
                      variant={isGraded ? "secondary" : studentSub ? "secondary" : "primary"}
                      onClick={() => setStudentActiveAssignment(a)}
                    >
                      {isGraded
                        ? "Ver Resultado y Feedback"
                        : studentSub
                        ? "Ver / Editar Entrega"
                        : "Entregar Tarea"}
                    </Button>
                  ) : (
                    <Button
                      variant={pendingGradingCount > 0 ? "primary" : "secondary"}
                      onClick={() => setSpeedGraderAssignment(a)}
                    >
                      ⚡ SpeedGrader ({subs.length} / {roster.length})
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Teacher: Create Assignment Modal */}
      {showCreateModal && (
        <TeacherAssignmentModal
          courses={safeCourses}
          initialCourseId={selectedCourseId !== "all" ? selectedCourseId : undefined}
          onClose={() => setShowCreateModal(false)}
          onCreated={loadData}
        />
      )}

      {/* Teacher: SpeedGrader Focus Workspace */}
      {speedGraderAssignment && (
        <TeacherSpeedGrader
          assignment={speedGraderAssignment}
          course={safeCourses.find((c) => c.id === speedGraderAssignment.course_id)}
          roster={rosterMap[speedGraderAssignment.id] || []}
          onClose={() => setSpeedGraderAssignment(null)}
          onGraded={loadData}
        />
      )}

      {/* Student: Assignment Submission & Feedback Modal */}
      {studentActiveAssignment && (
        <StudentAssignmentModal
          assignment={studentActiveAssignment}
          courseName={safeCourses.find((c) => c.id === studentActiveAssignment.course_id)?.name}
          existingSubmission={
            (submissions[studentActiveAssignment.id] || []).find((s) => s.student_id === user?.id) || null
          }
          onClose={() => setStudentActiveAssignment(null)}
          onSubmitted={loadData}
        />
      )}
    </div>
  );
}
