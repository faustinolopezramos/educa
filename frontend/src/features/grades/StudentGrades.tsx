import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from "recharts";

import { useAuth } from "../../auth/AuthContext";
import { Card, EmptyState, SectionHeading } from "../../components/ui";
import { IconCap, IconLock } from "../../components/icons";
import { useCourses, useEnrollments, useGrades, useStudentKardex } from "../../lib/queries";

const SERIES = "#0F6E62";
const FAIL = "#A8412C";
const MAX_SCORE = 10;

const SKILL_NAMES: Record<string, string> = {
  speaking: "Speaking",
  listening: "Listening",
  reading: "Reading",
  writing: "Writing",
  grammar: "Grammar",
  use_of_language: "Use of Lang",
};

export function StudentGrades() {
  const { user } = useAuth();
  const { data: grades = [] } = useGrades();
  const { data: enrollments = [] } = useEnrollments();
  const { data: courses = [] } = useCourses();
  const { data: kardex } = useStudentKardex(user?.id);

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

  const skillsRadarData = kardex?.summary?.skills_breakdown
    ? Object.entries(kardex.summary.skills_breakdown).map(([skill, score]) => ({
        skill: SKILL_NAMES[skill] ?? skill,
        score: Number(score.toFixed(1)),
      }))
    : [];

  const allScores = grades.map((g) => g.score);
  const bestScore = allScores.length ? Math.max(...allScores) : null;
  const overallAvg = allScores.length
    ? Number((allScores.reduce((s, n) => s + n, 0) / allScores.length).toFixed(1))
    : null;

  const hasGrades = grades.length > 0;

  if (hasOverdue) {
    return (
      <EmptyState
        icon={<IconLock className="h-5 w-5" />}
        title="Ponte al día para ver tus notas"
        message="Tienes cuotas pendientes en alguna matrícula activa. El acceso a tus calificaciones se restablece en cuanto se registre el pago."
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
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-100 bg-brand-50/60 px-4 py-2.5 text-xs text-brand-900">
        <div className="flex items-center gap-2">
          <span aria-hidden>📐</span>
          <span>
            <strong>Fórmula de Nota Final Institucional:</strong> 40% Tareas · 50% Exámenes · 10% Asistencia.
          </span>
        </div>
        <span className="text-2xs text-brand-700 font-medium">Escala de 0 a 10 puntos</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <SectionHeading>Progreso por evaluación</SectionHeading>
        <div className="space-y-6">
          {byCourse
            .filter((c) => c.rows.length > 0)
            .map((c) => {
              const courseObj = courses.find((co) => co.id === c.courseId);
              const passingScore = courseObj?.passing_score ?? 6.0;

              return (
                <div key={c.enrollmentId} className="rounded-lg border border-slate-100 bg-slate-50/50 p-3.5">
                  <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                      <span className="font-semibold text-slate-900 text-sm">
                        {courseName(c.courseId)}
                      </span>
                      <span className="ml-2 text-2xs text-slate-500 font-medium">
                        (Mín. aprobación: {passingScore})
                      </span>
                    </div>
                    <span className="tabular flex-none text-xs font-semibold text-brand-700">
                      Promedio {c.avg.toFixed(1)}/{MAX_SCORE}
                    </span>
                  </div>
                  <div className="space-y-3">
                    {c.rows.map((g) => (
                      <ProgressBar
                        key={g.id}
                        label={g.evaluation_name}
                        score={g.score}
                        passingScore={passingScore}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
        </div>
      </Card>

      {radarData.length >= 3 ? (
        <Card>
          <SectionHeading>Promedio por curso</SectionHeading>
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
          <p className="mt-1 text-center text-xs text-slate-500">
            Promedio de tus evaluaciones en cada curso (0–{MAX_SCORE}).
          </p>
        </Card>
      ) : skillsRadarData.length >= 3 ? (
        <Card>
          <div className="flex items-center justify-between mb-2">
            <SectionHeading>Competencias Comunicativas (MCER)</SectionHeading>
            <span className="rounded bg-brand-50 px-2 py-0.5 text-3xs font-semibold text-brand-700 border border-brand-200">
              Marco Común Europeo
            </span>
          </div>
          <div style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={skillsRadarData} outerRadius="72%">
                <PolarGrid stroke="#E6DFD0" />
                <PolarAngleAxis
                  dataKey="skill"
                  tick={{ fill: "#57503F", fontSize: 11 }}
                />
                <PolarRadiusAxis
                  domain={[0, MAX_SCORE]}
                  tick={{ fill: "#9C9484", fontSize: 10 }}
                />
                <Radar
                  name="Nivel"
                  dataKey="score"
                  stroke={SERIES}
                  fill={SERIES}
                  fillOpacity={0.35}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-1 text-center text-xs text-slate-500">
            Desglose de tus habilidades lingüísticas consolidadas (0–{MAX_SCORE}).
          </p>
        </Card>
      ) : (
        <Card className="flex flex-col justify-between">
          <div>
            <SectionHeading>Resumen de Evaluaciones</SectionHeading>
            <p className="text-xs text-slate-500 mb-4">
              Métricas consolidadas de tu desempeño académico actual.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-slate-50 p-3.5 border border-slate-100">
                <span className="text-3xs uppercase tracking-wider font-semibold text-slate-500 block">
                  Promedio Global
                </span>
                <span className="mt-1 text-2xl font-bold text-brand-700 block tabular">
                  {overallAvg != null ? `${overallAvg}/10` : "—"}
                </span>
              </div>
              <div className="rounded-xl bg-emerald-50/60 p-3.5 border border-emerald-100">
                <span className="text-3xs uppercase tracking-wider font-semibold text-emerald-700 block">
                  Mejor Nota
                </span>
                <span className="mt-1 text-2xl font-bold text-emerald-900 block tabular">
                  {bestScore != null ? `${bestScore}/10` : "—"}
                </span>
              </div>
              <div className="rounded-xl bg-slate-50 p-3.5 border border-slate-100">
                <span className="text-3xs uppercase tracking-wider font-semibold text-slate-500 block">
                  Total Evaluaciones
                </span>
                <span className="mt-1 text-2xl font-bold text-slate-900 block tabular">
                  {grades.length}
                </span>
              </div>
              <div className="rounded-xl bg-slate-50 p-3.5 border border-slate-100">
                <span className="text-3xs uppercase tracking-wider font-semibold text-slate-500 block">
                  Cursos Evaluados
                </span>
                <span className="mt-1 text-2xl font-bold text-slate-900 block tabular">
                  {byCourse.filter((c) => c.rows.length > 0).length}
                </span>
              </div>
            </div>
          </div>
          <div className="mt-6 pt-3 border-t border-slate-100 text-2xs text-slate-500 text-center">
            * Consulta tu expediente oficial en la pestaña «Historial» para detalles completos.
          </div>
        </Card>
      )}
      </div>
    </div>
  );
}

function ProgressBar({
  label,
  score,
  passingScore = 6.0,
}: {
  label: string;
  score: number;
  passingScore?: number;
}) {
  const pct = Math.max(0, Math.min(100, (score / MAX_SCORE) * 100));
  const passPct = Math.max(0, Math.min(100, (passingScore / MAX_SCORE) * 100));
  const passing = score >= passingScore;

  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-slate-700 font-medium">{label}</span>
        <div className="flex items-center gap-1.5">
          <span className={passing ? "text-emerald-700 font-semibold" : "text-red-600 font-semibold"}>
            {score}/{MAX_SCORE}
          </span>
          <span className="text-2xs text-slate-500">
            ({passing ? "Aprobada" : "Por mejorar"})
          </span>
        </div>
      </div>
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${pct}%`, backgroundColor: passing ? SERIES : FAIL }}
        />
        {/* Subtle passing threshold indicator */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-slate-400/70"
          style={{ left: `${passPct}%` }}
          title={`Mínimo de aprobación: ${passingScore}`}
        />
      </div>
    </div>
  );
}
