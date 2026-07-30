import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from "recharts";

import { Card, EmptyState, SectionHeading } from "../../components/ui";
import { IconCap, IconLock } from "../../components/icons";
import { useCourses, useEnrollments, useGrades } from "../../lib/queries";

const SERIES = "#0F6E62";
const FAIL = "#A8412C";
const MAX_SCORE = 10;

export function StudentGrades() {
  const { data: grades = [] } = useGrades();
  const { data: enrollments = [] } = useEnrollments();
  const { data: courses = [] } = useCourses();

  const hasOverdue = enrollments.some((e) => e.payment_status === "overdue");

  const courseName = (id: number) =>
    courses.find((c) => c.id === id)?.name ?? `#${id}`;

  const byCourse = enrollments.map((e) => {
    const rows = grades.filter((g) => g.enrollment_id === e.id);
    const avg =
      rows.length > 0
        ? rows.reduce((sum, g) => sum + g.score, 0) / rows.length
        : 0;
    return { enrollmentId: e.id, courseId: e.course_id, rows, avg };
  });

  const radarData = byCourse
    .filter((c) => c.rows.length > 0)
    .map((c) => ({ course: courseName(c.courseId), avg: Number(c.avg.toFixed(2)) }));

  const hasGrades = grades.length > 0;

  if (hasOverdue) {
    return (
      <EmptyState
        icon={<IconLock className="h-5 w-5" />}
        title="Ponte al día para ver tus notas"
        message="Tienes cuotas pendientes en alguna matrícula activa. El acceso a calificaciones y certificados se restablece en cuanto se registre el pago."
      />
    );
  }

  if (!hasGrades) {
    return (
      <EmptyState
        icon={<IconCap className="h-5 w-5" />}
        title="Todavía no tienes calificaciones"
        message="Cuando tu profesor registre la primera evaluación, la verás aquí."
      />
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <SectionHeading>Progreso por evaluación</SectionHeading>
        <div className="space-y-5">
          {byCourse
            .filter((c) => c.rows.length > 0)
            .map((c) => (
              <div key={c.enrollmentId}>
                <div className="mb-2 flex items-baseline justify-between gap-2">
                  <span className="min-w-0 truncate text-sm font-semibold text-slate-900">
                    {courseName(c.courseId)}
                  </span>
                  <span className="tabular flex-none text-xs text-slate-500">
                    Promedio {c.avg.toFixed(1)}/{MAX_SCORE}
                  </span>
                </div>
                <div className="space-y-2">
                  {c.rows.map((g) => (
                    <ProgressBar
                      key={g.id}
                      label={g.evaluation_name}
                      score={g.score}
                    />
                  ))}
                </div>
              </div>
            ))}
        </div>
      </Card>

      <Card>
        <SectionHeading>Promedio por curso</SectionHeading>
        {radarData.length === 0 ? (
          <p className="text-sm text-slate-500">
            Necesitas notas en al menos un curso para ver este gráfico.
          </p>
        ) : (
          <div style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData} outerRadius="72%">
                <PolarGrid stroke="#E6DFD0" />
                <PolarAngleAxis
                  dataKey="course"
                  tick={{ fill: "#57503F", fontSize: 12 }}
                />
                <PolarRadiusAxis
                  domain={[0, MAX_SCORE]}
                  tick={{ fill: "#9C9484", fontSize: 10 }}
                />
                <Radar
                  name="Promedio"
                  dataKey="avg"
                  stroke={SERIES}
                  fill={SERIES}
                  fillOpacity={0.35}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        )}
        <p className="mt-1 text-center text-xs text-slate-400">
          Promedio de tus evaluaciones en cada curso (0–{MAX_SCORE}).
        </p>
      </Card>
    </div>
  );
}

function ProgressBar({ label, score }: { label: string; score: number }) {
  const pct = Math.max(0, Math.min(100, (score / MAX_SCORE) * 100));
  const passing = score >= MAX_SCORE / 2;
  return (
    <div>
      <div className="mb-0.5 flex items-center justify-between text-xs">
        <span className="text-slate-600">{label}</span>
        <span className={passing ? "text-slate-700" : "text-red-600"}>
          {score}/{MAX_SCORE}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, backgroundColor: passing ? SERIES : FAIL }}
        />
      </div>
    </div>
  );
}
