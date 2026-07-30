import { useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import {
  Badge,
  Card,
  EmptyState,
  SearchInput,
  SectionHeading,
  SegmentedControl,
  Select,
  Stat,
  Table,
  Td,
  Th,
} from "../../components/ui";
import { IconChart } from "../../components/icons";
import type { Report } from "../../lib/types";

type PerformanceStatus = "optimal" | "warning" | "critical" | "no_data";

// El estado se nombra con palabras y color de fondo. Antes cada etiqueta
// empezaba con un círculo de color (🟢🟡🔴⚪) que repetía exactamente la
// información que ya daba el color del badge, y que además desaparece para
// quien no distingue esos tonos.
const STATUS_LABELS: Record<PerformanceStatus, string> = {
  optimal: "Óptimo",
  warning: "Atención",
  critical: "Crítico",
  no_data: "Sin datos",
};

const STATUS_COLORS: Record<PerformanceStatus, "green" | "amber" | "red" | "slate"> = {
  optimal: "green",
  warning: "amber",
  critical: "red",
  no_data: "slate",
};

function StatusBadge({ status }: { status: PerformanceStatus }) {
  return (
    <Badge color={STATUS_COLORS[status]} dot>
      {STATUS_LABELS[status]}
    </Badge>
  );
}

export function ConsolidatedPerformanceView({ report }: { report: Report }) {
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<PerformanceStatus | "all">("all");
  const [courseFilter, setCourseFilter] = useState<string>("all");

  const students = Array.isArray(report.consolidated_students)
    ? report.consolidated_students
    : [];
  const isStudent = user?.role === "student";

  const filteredStudents = students.filter((s) => {
    const matchesSearch = s.student_name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || s.performance_status === statusFilter;
    const matchesCourse = courseFilter === "all" || String(s.course_id) === courseFilter;
    return matchesSearch && matchesStatus && matchesCourse;
  });

  const uniqueCourses = Array.from(
    new Set(students.map((s) => JSON.stringify({ id: s.course_id, name: s.course_name }))),
  ).map((str) => JSON.parse(str) as { id: number; name: string });

  const totalStudents = students.length;
  const optimalCount = students.filter((s) => s.performance_status === "optimal").length;
  const warningCount = students.filter((s) => s.performance_status === "warning").length;
  const criticalCount = students.filter((s) => s.performance_status === "critical").length;
  const noDataCount = students.filter((s) => s.performance_status === "no_data").length;

  function averageOf(pick: (s: (typeof students)[number]) => number | null): string {
    const values = students.map(pick).filter((v): v is number => v !== null);
    if (values.length === 0) return "—";
    return (values.reduce((acc, v) => acc + v, 0) / values.length).toFixed(1);
  }

  const avgConsolidated = averageOf((s) => s.consolidated_score);
  const avgAssignments = averageOf((s) => s.assignments_avg);
  const avgExams = averageOf((s) => s.exams_avg);

  function score(value: number | null): string {
    return value === null ? "—" : value.toFixed(1);
  }

  function percent(value: number | null): string {
    return value === null ? "—" : `${(value * 100).toFixed(0)}%`;
  }

  function barWidth(value: number | null, scale: number): string {
    return value === null ? "0%" : `${Math.min(100, value * scale)}%`;
  }

  /* ---------------- Vista del alumno ---------------- */
  if (isStudent) {
    const studentReport = students.find((s) => s.student_id === user?.id) || students[0];

    if (!studentReport) {
      return (
        <EmptyState
          icon={<IconChart className="h-5 w-5" />}
          title="Todavía no hay reporte"
          message="Cuando tengas notas y asistencia registradas en el periodo, tu rendimiento aparecerá aquí."
        />
      );
    }

    return (
      <div className="space-y-4">
        <Card>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-wide text-brand-600">
                {studentReport.course_name}
              </div>
              <h2 className="mt-1 text-lg font-bold tracking-tight text-slate-900">
                Tu nota consolidada
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                40% tareas · 50% exámenes · 10% asistencia
              </p>
            </div>

            <div className="flex items-center gap-3">
              <span className="tabular text-4xl font-bold tracking-tight text-brand-700">
                {score(studentReport.consolidated_score)}
                <span className="text-lg font-semibold text-slate-400">/10</span>
              </span>
              <StatusBadge status={studentReport.performance_status} />
            </div>
          </div>
        </Card>

        <div className="grid gap-3 md:grid-cols-3">
          <MetricCard
            label="Tareas"
            weight="40%"
            value={score(studentReport.assignments_avg)}
            barWidth={barWidth(studentReport.assignments_avg, 10)}
            barClass="bg-brand-600"
            hint={`Entregadas: ${percent(studentReport.assignments_completion_rate)}`}
          />
          <MetricCard
            label="Exámenes"
            weight="50%"
            value={score(studentReport.exams_avg)}
            barWidth={barWidth(studentReport.exams_avg, 10)}
            barClass="bg-brand-600"
            hint="Evaluaciones periódicas"
          />
          <MetricCard
            label="Asistencia"
            weight="10%"
            value={percent(studentReport.attendance_rate)}
            barWidth={barWidth(studentReport.attendance_rate, 100)}
            barClass="bg-emerald-600"
            hint="Presencia en clases"
          />
        </div>
      </div>
    );
  }

  /* ---------------- Vista de dirección / docente ---------------- */
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Promedio consolidado"
          value={avgConsolidated}
          hint={`Tareas ${avgAssignments} · Exámenes ${avgExams}`}
        />
        <Stat label="Óptimo (≥ 8.5)" value={optimalCount} tone="positive" />
        <Stat label="Atención (6.0 – 8.4)" value={warningCount} tone="warning" />
        <Stat label="Crítico (< 6.0)" value={criticalCount} tone="critical" />
      </div>

      <Card padding="none" className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2.5 border-b border-slate-200 p-2.5">
          <SearchInput
            placeholder="Buscar alumno"
            className="w-full sm:w-56"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <Select
            className="w-full sm:w-48"
            value={courseFilter}
            onChange={(e) => setCourseFilter(e.target.value)}
          >
            <option value="all">Todos los cursos</option>
            {uniqueCourses.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.name}
              </option>
            ))}
          </Select>
          <SegmentedControl
            className="sm:ml-auto"
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: "all" as const, label: "Todos", count: totalStudents },
              { value: "optimal" as const, label: "Óptimo", count: optimalCount },
              { value: "warning" as const, label: "Atención", count: warningCount },
              { value: "critical" as const, label: "Crítico", count: criticalCount },
              { value: "no_data" as const, label: "Sin datos", count: noDataCount },
            ]}
          />
        </div>

        {filteredStudents.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={<IconChart className="h-5 w-5" />}
              title="Ningún alumno coincide"
              message="Prueba con otro curso, otro estado o limpia la búsqueda."
            />
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Alumno</Th>
                <Th>Curso</Th>
                <Th align="right">Tareas 40%</Th>
                <Th align="right">Exámenes 50%</Th>
                <Th align="right">Asistencia 10%</Th>
                <Th align="right">Consolidada</Th>
                <Th>Estado</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredStudents.map((st) => (
                <tr key={`${st.student_id}-${st.course_id}`} className="hover:bg-slate-50">
                  <Td>
                    <span className="font-medium text-slate-900">{st.student_name}</span>
                  </Td>
                  <Td>
                    <span className="text-slate-600">{st.course_name}</span>
                  </Td>
                  <Td align="right">
                    <div className="tabular">{score(st.assignments_avg)}</div>
                    <div className="tabular text-xs text-slate-400">
                      {percent(st.assignments_completion_rate)} entregado
                    </div>
                  </Td>
                  <Td align="right">
                    <span className="tabular">{score(st.exams_avg)}</span>
                  </Td>
                  <Td align="right">
                    <span className="tabular">{percent(st.attendance_rate)}</span>
                  </Td>
                  <Td align="right">
                    <span className="tabular font-bold text-slate-900">
                      {score(st.consolidated_score)}
                    </span>
                  </Td>
                  <Td>
                    <StatusBadge status={st.performance_status} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}

function MetricCard({
  label,
  weight,
  value,
  barWidth,
  barClass,
  hint,
}: {
  label: string;
  weight: string;
  value: string;
  barWidth: string;
  barClass: string;
  hint: string;
}) {
  return (
    <Card padding="sm">
      <div className="flex items-baseline justify-between">
        <SectionHeading className="!mb-0">
          {label} <span className="font-normal text-slate-400">{weight}</span>
        </SectionHeading>
        <span className="tabular text-base font-bold text-slate-900">{value}</span>
      </div>
      <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${barClass}`} style={{ width: barWidth }} />
      </div>
      <p className="mt-1.5 text-xs text-slate-500">{hint}</p>
    </Card>
  );
}
