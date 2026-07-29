import { useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { Badge, Card, Input, Select } from "../../components/ui";
import type { Report } from "../../lib/types";

export function ConsolidatedPerformanceView({ report }: { report: Report }) {
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "optimal" | "warning" | "critical" | "no_data"
  >("all");
  const [courseFilter, setCourseFilter] = useState<string>("all");

  const students = Array.isArray(report.consolidated_students) ? report.consolidated_students : [];
  const isStudent = user?.role === "student";

  // Filtered Students for Staff View
  const filteredStudents = students.filter((s) => {
    const matchesSearch = s.student_name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || s.performance_status === statusFilter;
    const matchesCourse = courseFilter === "all" || String(s.course_id) === courseFilter;
    return matchesSearch && matchesStatus && matchesCourse;
  });

  // Unique Courses for Filter Dropdown
  const uniqueCourses = Array.from(
    new Set(students.map((s) => JSON.stringify({ id: s.course_id, name: s.course_name })))
  ).map((str) => JSON.parse(str) as { id: number; name: string });

  // KPI Calculations
  const totalStudents = students.length;
  const optimalCount = students.filter((s) => s.performance_status === "optimal").length;
  const warningCount = students.filter((s) => s.performance_status === "warning").length;
  const criticalCount = students.filter((s) => s.performance_status === "critical").length;
  const noDataCount = students.filter((s) => s.performance_status === "no_data").length;

  function averageOf(pick: (s: (typeof students)[number]) => number | null): string {
    const values = students.map(pick).filter((v): v is number => v !== null);
    if (values.length === 0) return "N/A";
    return (values.reduce((acc, v) => acc + v, 0) / values.length).toFixed(1);
  }

  const avgConsolidated = averageOf((s) => s.consolidated_score);
  const avgAssignments = averageOf((s) => s.assignments_avg);
  const avgExams = averageOf((s) => s.exams_avg);

  function score(value: number | null): string {
    return value === null ? "—" : `${value.toFixed(1)} / 10`;
  }

  function percent(value: number | null): string {
    return value === null ? "—" : `${(value * 100).toFixed(0)}%`;
  }

  function barWidth(value: number | null, scale: number): string {
    return value === null ? "0%" : `${Math.min(100, value * scale)}%`;
  }

  function getStatusBadge(status: "optimal" | "warning" | "critical" | "no_data") {
    if (status === "optimal") return <Badge color="green">🟢 Óptimo</Badge>;
    if (status === "warning") return <Badge color="amber">🟡 Atención</Badge>;
    if (status === "critical") return <Badge color="red">🔴 Crítico</Badge>;
    return <Badge color="slate">⚪ Sin datos</Badge>;
  }

  // Single Student View (If logged in user is student)
  if (isStudent) {
    const studentReport = students.find((s) => s.student_id === user?.id) || students[0];

    if (!studentReport) {
      return (
        <Card className="p-8 text-center text-slate-400 text-xs italic">
          No se encontró un reporte consolidado activo para tu cuenta en este periodo.
        </Card>
      );
    }

    return (
      <div className="space-y-4">
        <Card className="p-5 rounded-2xl border border-brand-200 bg-white shadow-2xs">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-brand-600">
                {studentReport.course_name}
              </span>
              <h2 className="text-xl font-serif font-bold text-slate-900 mt-1">
                Tu Rendimiento Académico Consolidado 360°
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                40% Tareas + 50% Exámenes + 10% Asistencia
              </p>
            </div>

            <div className="text-center bg-brand-50/60 px-5 py-3 rounded-xl border border-brand-100">
              <span className="text-[11px] font-semibold text-slate-500 uppercase">Nota Consolidada</span>
              <div className="text-3xl font-extrabold text-brand-700 mt-0.5">
                {score(studentReport.consolidated_score)}
              </div>
              <div className="mt-1">{getStatusBadge(studentReport.performance_status)}</div>
            </div>
          </div>
        </Card>

        {/* 3 Metric Breakdown Cards */}
        <div className="grid gap-3 md:grid-cols-3">
          <Card className="p-4 rounded-2xl border border-slate-200/80 bg-white shadow-2xs space-y-2">
            <div className="flex items-center justify-between text-slate-700">
              <span className="text-xs font-semibold text-slate-600">📚 Tareas (40%)</span>
              <span className="text-sm font-bold text-brand-600">{score(studentReport.assignments_avg)}</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-slate-100">
              <div
                className="h-1.5 rounded-full bg-brand-600 transition-all"
                style={{ width: barWidth(studentReport.assignments_avg, 10) }}
              />
            </div>
            <p className="text-[11px] text-slate-400">
              Entregadas: {percent(studentReport.assignments_completion_rate)}
            </p>
          </Card>

          <Card className="p-4 rounded-2xl border border-slate-200/80 bg-white shadow-2xs space-y-2">
            <div className="flex items-center justify-between text-slate-700">
              <span className="text-xs font-semibold text-slate-600">📝 Exámenes (50%)</span>
              <span className="text-sm font-bold text-indigo-600">{score(studentReport.exams_avg)}</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-slate-100">
              <div
                className="h-1.5 rounded-full bg-indigo-600 transition-all"
                style={{ width: barWidth(studentReport.exams_avg, 10) }}
              />
            </div>
            <p className="text-[11px] text-slate-400">Evaluaciones periódicas</p>
          </Card>

          <Card className="p-4 rounded-2xl border border-slate-200/80 bg-white shadow-2xs space-y-2">
            <div className="flex items-center justify-between text-slate-700">
              <span className="text-xs font-semibold text-slate-600">🕒 Asistencia (10%)</span>
              <span className="text-sm font-bold text-emerald-600">{percent(studentReport.attendance_rate)}</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-slate-100">
              <div
                className="h-1.5 rounded-full bg-emerald-600 transition-all"
                style={{ width: barWidth(studentReport.attendance_rate, 100) }}
              />
            </div>
            <p className="text-[11px] text-slate-400">Presencia en clases</p>
          </Card>
        </div>
      </div>
    );
  }

  // Staff / Admin Dashboard View
  return (
    <div className="space-y-4">
      {/* Executive Micro-KPI Summary Bar */}
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-2xs">
          <div className="text-[11px] text-slate-400 font-medium uppercase tracking-wider">Promedio Consolidado</div>
          <div className="mt-0.5 font-serif text-2xl font-bold text-slate-900">{avgConsolidated}</div>
          <div className="text-[10px] text-slate-400">Tareas: {avgAssignments} · Exámenes: {avgExams}</div>
        </div>

        <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/50 p-3.5 shadow-2xs">
          <div className="text-[11px] text-emerald-800 font-medium uppercase tracking-wider">🟢 Óptimo (≥ 8.5)</div>
          <div className="mt-0.5 font-serif text-2xl font-bold text-emerald-800">{optimalCount}</div>
          <div className="text-[10px] text-emerald-700">Alumnos aprobados</div>
        </div>

        <div className="rounded-2xl border border-amber-200/80 bg-amber-50/50 p-3.5 shadow-2xs">
          <div className="text-[11px] text-amber-900 font-medium uppercase tracking-wider">🟡 Atención (6.0 - 7.9)</div>
          <div className="mt-0.5 font-serif text-2xl font-bold text-amber-900">{warningCount}</div>
          <div className="text-[10px] text-amber-800">Alumnos a monitorear</div>
        </div>

        <div className="rounded-2xl border border-red-200/80 bg-red-50/50 p-3.5 shadow-2xs">
          <div className="text-[11px] text-red-900 font-medium uppercase tracking-wider">🔴 Alerta Crítica (&lt; 6.0)</div>
          <div className="mt-0.5 font-serif text-2xl font-bold text-red-900">{criticalCount}</div>
          <div className="text-[10px] text-red-800">Alumnos en riesgo</div>
        </div>
      </div>

      {/* Sleek Filter Bar & Performance Table */}
      <Card className="p-4 space-y-3 rounded-2xl border border-slate-200/80 bg-white shadow-2xs">
        <div className="flex flex-col sm:flex-row gap-2.5 items-center justify-between text-xs">
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <Input
              placeholder="🔍 Buscar por nombre del alumno…"
              className="w-full sm:w-64"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />

            <Select value={courseFilter} onChange={(e) => setCourseFilter(e.target.value)}>
              <option value="all">Todos los Cursos</option>
              {uniqueCourses.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 text-xs">
            <button
              onClick={() => setStatusFilter("all")}
              className={`rounded-md px-2.5 py-1 transition ${
                statusFilter === "all" ? "bg-white text-slate-900 shadow-2xs font-semibold" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Todos ({totalStudents})
            </button>
            <button
              onClick={() => setStatusFilter("optimal")}
              className={`rounded-md px-2.5 py-1 transition ${
                statusFilter === "optimal" ? "bg-emerald-600 text-white font-semibold shadow-2xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Óptimo ({optimalCount})
            </button>
            <button
              onClick={() => setStatusFilter("warning")}
              className={`rounded-md px-2.5 py-1 transition ${
                statusFilter === "warning" ? "bg-amber-600 text-white font-semibold shadow-2xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Atención ({warningCount})
            </button>
            <button
              onClick={() => setStatusFilter("critical")}
              className={`rounded-md px-2.5 py-1 transition ${
                statusFilter === "critical" ? "bg-red-600 text-white font-semibold shadow-2xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Crítico ({criticalCount})
            </button>
            <button
              onClick={() => setStatusFilter("no_data")}
              className={`rounded-md px-2.5 py-1 transition ${
                statusFilter === "no_data" ? "bg-slate-600 text-white font-semibold shadow-2xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Sin datos ({noDataCount})
            </button>
          </div>
        </div>

        {/* 360° Consolidated Table */}
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="p-3">Alumno</th>
                <th className="p-3">Curso</th>
                <th className="p-3 text-center">📚 Tareas (40%)</th>
                <th className="p-3 text-center">📝 Exámenes (50%)</th>
                <th className="p-3 text-center">🕒 Asistencia (10%)</th>
                <th className="p-3 text-center">💯 Nota 360°</th>
                <th className="p-3 text-center">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400 italic">
                    No se encontraron alumnos con los criterios seleccionados.
                  </td>
                </tr>
              ) : (
                filteredStudents.map((st) => (
                  <tr key={`${st.student_id}-${st.course_id}`} className="hover:bg-slate-50/80 transition">
                    <td className="p-3 font-semibold text-slate-900">{st.student_name}</td>
                    <td className="p-3 text-slate-600">{st.course_name}</td>
                    <td className="p-3 text-center font-medium text-slate-700">
                      <div>{score(st.assignments_avg)}</div>
                      <span className="text-[10px] text-slate-400">
                        Entregas: {percent(st.assignments_completion_rate)}
                      </span>
                    </td>
                    <td className="p-3 text-center font-medium text-slate-700">
                      {score(st.exams_avg)}
                    </td>
                    <td className="p-3 text-center font-medium text-slate-700">
                      {percent(st.attendance_rate)}
                    </td>
                    <td className="p-3 text-center text-sm font-extrabold text-brand-700">
                      {st.consolidated_score === null
                        ? "—"
                        : st.consolidated_score.toFixed(1)}
                    </td>
                    <td className="p-3 text-center">{getStatusBadge(st.performance_status)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
