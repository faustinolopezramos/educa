import { useAuth } from "../../auth/AuthContext";
import { Badge, Button, Card, EmptyState, SkeletonRows } from "../../components/ui";
import { IconCap, IconLock } from "../../components/icons";
import { downloadCertificatePdf, useStudentKardex } from "../../lib/queries";
import { notify } from "../../lib/toast";

export function StudentKardexView() {
  const { user } = useAuth();
  const { data: kardex, isLoading, isError } = useStudentKardex(user?.id);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <SkeletonRows rows={3} />
        <SkeletonRows rows={4} />
      </div>
    );
  }

  if (isError || !kardex) {
    return (
      <EmptyState
        icon={<IconCap className="h-6 w-6" />}
        title="No se pudo cargar el expediente"
        message="Ocurrió un inconveniente al consultar tu historial académico. Por favor intenta nuevamente más tarde."
      />
    );
  }

  const { summary, history } = kardex;

  return (
    <div className="space-y-6 print:space-y-4">
      {/* Action Header / Print Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm print:border-none print:p-0 print:shadow-none">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-slate-900 print:text-2xl">
              Expediente Académico Oficial (Kardex)
            </h2>
            <Badge
              color={
                summary.person_status === "active"
                  ? "green"
                  : summary.person_status === "delinquent"
                    ? "red"
                    : summary.person_status === "graduated"
                      ? "indigo"
                      : "amber"
              }
            >
              {summary.person_status_label}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Estudiante: <strong className="text-slate-800">{kardex.student_name}</strong> ·{" "}
            {kardex.student_email}
            {kardex.phone && ` · Tel: ${kardex.phone}`}
            {kardex.nationality && ` · Nacionalidad: ${kardex.nationality}`}
          </p>
        </div>

        <div className="flex items-center gap-2 print:hidden">
          <Button
            variant="secondary"
            onClick={() => window.print()}
            className="flex items-center gap-1.5"
          >
            <span>🖨️</span>
            <span>Imprimir Expediente</span>
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 print:grid-cols-4">
        <Card className="p-4 border-slate-200 bg-white">
          <div className="text-2xs font-semibold uppercase tracking-wider text-slate-500">
            Promedio General (GPA)
          </div>
          <div className="mt-1 text-2xl font-bold text-brand-700">
            {summary.global_gpa > 0 ? `${summary.global_gpa} / 10` : "—"}
          </div>
          <div className="mt-0.5 text-xs text-slate-400">Escala 0–10</div>
        </Card>

        <Card className="p-4 border-slate-200 bg-white">
          <div className="text-2xs font-semibold uppercase tracking-wider text-slate-500">
            Asistencia Global
          </div>
          <div className="mt-1 text-2xl font-bold text-emerald-700">
            {summary.overall_attendance_rate}%
          </div>
          <div className="mt-0.5 text-xs text-slate-400">Excluye justificadas</div>
        </Card>

        <Card className="p-4 border-slate-200 bg-white">
          <div className="text-2xs font-semibold uppercase tracking-wider text-slate-500">
            Cursos Aprobados
          </div>
          <div className="mt-1 text-2xl font-bold text-slate-900">
            {summary.total_courses_passed}
          </div>
          <div className="mt-0.5 text-xs text-slate-400">
            {summary.total_courses_failed > 0
              ? `${summary.total_courses_failed} reprobado(s)`
              : "0 reprobados"}
          </div>
        </Card>

        <Card className="p-4 border-slate-200 bg-white">
          <div className="text-2xs font-semibold uppercase tracking-wider text-slate-500">
            Certificados Obtenidos
          </div>
          <div className="mt-1 text-2xl font-bold text-amber-700">
            {summary.total_certificates_earned}
          </div>
          <div className="mt-0.5 text-xs text-slate-400">Diplomas emitidos</div>
        </Card>
      </div>

      {/* Delinquency Alert if any */}
      {summary.outstanding_balance > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-900 print:border print:border-amber-300">
          <IconLock className="h-5 w-5 flex-none text-amber-700 mt-0.5" />
          <div>
            <span className="font-bold">Saldo pendiente en registro: </span>
            <span>
              Tienes un balance pendiente de Q {summary.outstanding_balance.toFixed(2)}. Acércate a
              administración para mantener tu solvencia al día.
            </span>
          </div>
        </div>
      )}

      {/* Chronological Academic Records Table */}
      <Card className="overflow-hidden border-slate-200 p-0 shadow-sm print:border print:border-slate-300">
        <div className="border-b border-slate-100 bg-slate-50/75 px-5 py-3.5 flex items-center justify-between">
          <h3 className="font-semibold text-slate-900 text-sm">
            Historial de Cursos y Evaluaciones ({history.length})
          </h3>
          <span className="text-xs text-slate-500">Cronológico por fecha de matrícula</span>
        </div>

        {history.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            No tienes materias registradas en tu historial por el momento.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50/50 text-2xs font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-3">Código Matrícula</th>
                  <th className="px-5 py-3">Curso & Nivel</th>
                  <th className="px-5 py-3">Estado</th>
                  <th className="px-5 py-3 text-center">Nota Final</th>
                  <th className="px-5 py-3 text-center">Resultado</th>
                  <th className="px-5 py-3 text-right">Certificado / Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {history.map((entry) => (
                  <tr key={entry.enrollment_id} className="hover:bg-slate-50/50 transition">
                    <td className="px-5 py-3.5 font-mono text-xs font-semibold text-brand-700">
                      {entry.enrollment_code}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="font-medium text-slate-900">{entry.course_title}</div>
                      <div className="text-2xs text-slate-500">{entry.level_name}</div>
                    </td>
                    <td className="px-5 py-3.5">
                      <Badge
                        color={
                          entry.status === "certified"
                            ? "indigo"
                            : entry.status === "active"
                              ? "green"
                              : entry.status === "withdrawn"
                                ? "red"
                                : "slate"
                        }
                      >
                        {entry.status_label}
                      </Badge>
                    </td>
                    <td className="px-5 py-3.5 text-center font-bold tabular text-slate-900">
                      {entry.final_score != null ? (
                        <span
                          className={
                            entry.passed ? "text-emerald-700 font-bold" : "text-red-600"
                          }
                        >
                          {entry.final_score.toFixed(1)}
                        </span>
                      ) : (
                        <span className="text-slate-400 font-normal">En curso</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      {entry.passed === true ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                          <span>✓</span> Aprobado
                        </span>
                      ) : entry.passed === false ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600">
                          <span>✗</span> Reprobado
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">Cursando</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      {entry.certificate_code ? (
                        <div className="flex flex-col items-end gap-1">
                          <span className="font-mono text-2xs font-medium text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                            {entry.certificate_code}
                          </span>
                          {entry.certificate_id && (
                            <button
                              type="button"
                              onClick={() =>
                                downloadCertificatePdf(
                                  entry.certificate_id!,
                                  entry.certificate_code!,
                                ).catch(() =>
                                  notify("No se pudo descargar el certificado", "error"),
                                )
                              }
                              className="text-2xs font-semibold text-brand-600 hover:text-brand-800 hover:underline print:hidden"
                            >
                              Descargar PDF ↓
                            </button>
                          )}
                        </div>
                      ) : (
                        <span className="text-2xs text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
