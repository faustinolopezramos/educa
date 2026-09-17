import { useEffect, useState } from "react";
import { Badge, Button, Card } from "../../components/ui";
import { api } from "../../lib/api";
import { notify } from "../../lib/toast";

interface KardexSummary {
  global_gpa: number;
  overall_attendance_rate: number;
  total_courses_passed: number;
  total_courses_failed: number;
  person_status: string;
  person_status_label: string;
  outstanding_balance: number;
}

interface KardexCourseEntry {
  enrollment_id: number;
  course_id: number;
  course_title: string;
  level_name: string;
  status: string;
  status_label: string;
  enrollment_code: string;
  final_score: number | null;
  passed: boolean | null;
  balance: number;
}

interface StudentKardexResponse {
  student_id: number;
  student_name: string;
  student_email: string;
  phone: string | null;
  nationality: string | null;
  summary: KardexSummary;
  history: KardexCourseEntry[];
}

export function StudentKardexModal({
  studentId,
  onClose,
  onPromote,
}: {
  studentId: number;
  onClose: () => void;
  onPromote?: (studentId: number) => void;
}) {
  const [data, setData] = useState<StudentKardexResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .get<StudentKardexResponse>(`/users/${studentId}/kardex`)
      .then((res) => setData(res.data))
      .catch((err) => {
        notify("Error al cargar expediente del estudiante: " + err.message, "error");
        onClose();
      })
      .finally(() => setLoading(false));
  }, [studentId]);

  if (loading || !data) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
        <div className="w-full max-w-3xl rounded-xl bg-slate-900 p-6 border border-slate-800 text-center text-slate-300">
          Cargando Expediente 360°...
        </div>
      </div>
    );
  }

  const { summary, history } = data;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="w-full max-w-4xl rounded-xl bg-slate-900 border border-slate-800 p-6 shadow-2xl text-slate-100 space-y-6 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold text-white">{data.student_name}</h2>
              <Badge color={summary.person_status === "active" ? "green" : summary.person_status === "delinquent" ? "red" : "amber"}>
                {summary.person_status_label}
              </Badge>
            </div>
            <p className="text-sm text-slate-400 mt-1">
              {data.student_email} {data.phone ? `• ${data.phone}` : ""} {data.nationality ? `• Nacionalidad: ${data.nationality}` : ""}
            </p>
          </div>
          <Button variant="secondary" onClick={onClose}>
            Cerrar
          </Button>
        </div>

        {/* Key Performance Indicators (KPI Cards) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="p-3 bg-slate-800/60 border-slate-700/50">
            <div className="text-2xs font-semibold text-slate-400 uppercase tracking-wider">Promedio GPA</div>
            <div className="text-2xl font-bold text-brand-400 mt-1">{summary.global_gpa > 0 ? `${summary.global_gpa} / 10` : "N/A"}</div>
          </Card>

          <Card className="p-3 bg-slate-800/60 border-slate-700/50">
            <div className="text-2xs font-semibold text-slate-400 uppercase tracking-wider">Asistencia Global</div>
            <div className="text-2xl font-bold text-emerald-400 mt-1">{summary.overall_attendance_rate}%</div>
          </Card>

          <Card className="p-3 bg-slate-800/60 border-slate-700/50">
            <div className="text-2xs font-semibold text-slate-400 uppercase tracking-wider">Cursos Aprobados</div>
            <div className="text-2xl font-bold text-indigo-400 mt-1">{summary.total_courses_passed}</div>
          </Card>
        </div>

        {/* Academic History Timeline */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-white">Historial de Cursos & Expediente Académico</h3>
            {summary.total_courses_passed > 0 && onPromote && (
              <Button variant="primary" onClick={() => onPromote(data.student_id)}>
                ⚡ Promover al Siguiente Nivel
              </Button>
            )}
          </div>

          {history.length === 0 ? (
            <div className="p-6 text-center text-slate-500 bg-slate-800/30 rounded-lg">
              El alumno no tiene cursos registrados en su historial.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-900/50">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="bg-slate-800/70 text-2xs uppercase tracking-wider text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="p-3">Carné / Código</th>
                    <th className="p-3">Curso / Nivel</th>
                    <th className="p-3">Estado</th>
                    <th className="p-3">Nota Final</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {history.map((item) => (
                    <tr key={item.enrollment_id} className="hover:bg-slate-800/40">
                      <td className="p-3 font-mono text-xs text-brand-300">{item.enrollment_code}</td>
                      <td className="p-3">
                        <div className="font-semibold text-white">{item.course_title}</div>
                        <div className="text-2xs text-slate-400">{item.level_name}</div>
                      </td>
                      <td className="p-3">
                        <Badge color={item.status === "certified" ? "green" : item.status === "active" ? "sky" : "slate"}>
                          {item.status_label}
                        </Badge>
                      </td>
                      <td className="p-3 font-semibold">
                        {item.final_score !== null ? (
                          <span className={item.passed ? "text-emerald-400" : "text-rose-400"}>
                            {item.final_score.toFixed(1)} / 10
                          </span>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
