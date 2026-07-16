import { useState } from "react";

import { Button, Card } from "../../components/ui";
import { apiErrorMessage } from "../../lib/api";
import {
  useCourses,
  useCreateEnrollment,
  useEnrollments,
  useUsers,
} from "../../lib/queries";

interface Props {
  onClose: () => void;
}

// Extracts the FastAPI 409 detail (message + reason) from an axios error.
function conflictDetail(
  e: unknown,
): { message: string; reason?: string } | null {
  const err = e as {
    response?: { status?: number; data?: { detail?: unknown } };
  };
  if (err.response?.status !== 409) return null;
  const detail = err.response.data?.detail;
  if (typeof detail === "string") return { message: detail };
  if (detail && typeof detail === "object") {
    const d = detail as { message?: string; reason?: string };
    return { message: d.message ?? "Conflicto", reason: d.reason };
  }
  return { message: "Conflicto" };
}

export function EnrollWizard({ onClose }: Props) {
  const { data: courses = [] } = useCourses();
  const { data: students = [] } = useUsers("student");
  const { data: enrollments = [] } = useEnrollments();
  const create = useCreateEnrollment();

  const [step, setStep] = useState(1);
  const [courseId, setCourseId] = useState(0);
  const [studentId, setStudentId] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [clash, setClash] = useState(false); // student-schedule clash → offer force

  const course = courses.find((c) => c.id === courseId);
  const activeInCourse = enrollments.filter(
    (e) => e.course_id === courseId && e.status === "active",
  ).length;
  const remaining = course ? course.max_students - activeInCourse : 0;
  const full = course ? remaining <= 0 : false;

  // Hide students already enrolled in the selected course (any status).
  const enrolledStudentIds = new Set(
    enrollments.filter((e) => e.course_id === courseId).map((e) => e.student_id),
  );
  const selectableStudents = students.filter((s) => !enrolledStudentIds.has(s.id));

  async function submit(force = false) {
    setError(null);
    try {
      await create.mutateAsync({ student_id: studentId, course_id: courseId, force });
      onClose();
    } catch (e) {
      const detail = conflictDetail(e);
      if (detail?.reason === "student_schedule") {
        setClash(true);
        setError(detail.message);
      } else {
        setClash(false);
        setError(detail?.message ?? apiErrorMessage(e));
      }
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4">
      <Card className="w-full max-w-md">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-medium">Matricular alumno</h3>
          <span className="text-xs text-slate-400">Paso {step} de 3</span>
        </div>

        {step === 1 && (
          <div className="space-y-3">
            <label className="block text-sm font-medium text-slate-700">Curso</label>
            <select
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={courseId}
              onChange={(e) => setCourseId(Number(e.target.value))}
            >
              <option value={0}>Selecciona…</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {course && (
              <p className={`text-sm ${full ? "text-red-600" : "text-slate-500"}`}>
                Cupo: {activeInCourse}/{course.max_students}{" "}
                {full ? "· lleno" : `· ${remaining} disponible(s)`}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={onClose}>
                Cancelar
              </Button>
              <Button disabled={!courseId || full} onClick={() => setStep(2)}>
                Siguiente
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <label className="block text-sm font-medium text-slate-700">Alumno</label>
            <select
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={studentId}
              onChange={(e) => setStudentId(Number(e.target.value))}
            >
              <option value={0}>Selecciona…</option>
              {selectableStudents.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name}
                </option>
              ))}
            </select>
            {selectableStudents.length === 0 && (
              <p className="text-sm text-slate-400">
                Todos los alumnos ya están matriculados en este curso.
              </p>
            )}
            <div className="flex justify-between gap-2">
              <Button variant="ghost" onClick={() => setStep(1)}>
                Atrás
              </Button>
              <Button disabled={!studentId} onClick={() => setStep(3)}>
                Siguiente
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <div className="rounded-lg bg-slate-50 p-3 text-sm">
              <div>
                <span className="text-slate-400">Curso:</span> {course?.name}
              </div>
              <div>
                <span className="text-slate-400">Alumno:</span>{" "}
                {students.find((s) => s.id === studentId)?.full_name}
              </div>
              <div>
                <span className="text-slate-400">Cupo:</span> {activeInCourse}/
                {course?.max_students}
              </div>
            </div>
            {error && (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                {error}
              </p>
            )}
            <div className="flex justify-between gap-2">
              <Button variant="ghost" onClick={() => setStep(2)}>
                Atrás
              </Button>
              <div className="flex gap-2">
                {clash && (
                  <Button
                    variant="danger"
                    disabled={create.isPending}
                    onClick={() => submit(true)}
                  >
                    Matricular igualmente
                  </Button>
                )}
                <Button disabled={create.isPending} onClick={() => submit(false)}>
                  Confirmar
                </Button>
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
