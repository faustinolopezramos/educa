import { useMemo, useState } from "react";

import { Button, Field, Input, Modal, ModalActions, SearchSelect } from "../../components/ui";
import type { SearchOption } from "../../components/ui";
import { apiErrorMessage } from "../../lib/api";
import { DAYS } from "../../lib/format";
import {
  useCourses,
  useCreateEnrollment,
  useCreateUser,
  useEnrollments,
  useSchedules,
  useUsers,
} from "../../lib/queries";
import { notify } from "../../lib/toast";

interface Props {
  initialCourseId?: number;
  initialStudentId?: number;
  onClose: () => void;
}

const DEFAULT_PASSWORD = "Educa2026!";

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
  return { message: "Conflicto de inscripción" };
}

// Enrolling is one decision — who, and into what — so it is one screen. The
// course panel fills in as soon as a course is chosen, which is the same
// information the old confirmation step used to show a click later.
export function EnrollWizard({ initialCourseId, initialStudentId, onClose }: Props) {
  const { data: courses = [] } = useCourses();
  const { data: students = [] } = useUsers("student");
  const { data: teachers = [] } = useUsers("teacher");
  const { data: enrollments = [] } = useEnrollments();
  const schedulesRes = useSchedules();
  const schedules = schedulesRes?.data ?? [];

  const createUser = useCreateUser();
  const createEnrollment = useCreateEnrollment();

  const [studentMode, setStudentMode] = useState<"new" | "existing">(
    initialStudentId ? "existing" : "existing",
  );

  // New student fields
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [cuiPassport, setCuiPassport] = useState("");
  const [password, setPassword] = useState(DEFAULT_PASSWORD);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [studentId, setStudentId] = useState<number>(initialStudentId ?? 0);
  const [courseId, setCourseId] = useState<number>(initialCourseId ?? 0);

  const [error, setError] = useState<string | null>(null);
  const [clash, setClash] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const course = courses.find((c) => c.id === courseId);
  const activeInCourse = enrollments.filter(
    (e) => e.course_id === courseId && e.status === "active",
  ).length;
  const remaining = course ? course.max_students - activeInCourse : 0;
  const full = course ? remaining <= 0 : false;

  const courseSchedules = schedules.filter((s) => s.course_id === courseId);
  const teacherName = (id: number) => teachers.find((t) => t.id === id)?.full_name ?? `#${id}`;
  const selectedStudent = students.find((s) => s.id === studentId);

  const studentOptions: SearchOption[] = useMemo(
    () => students.map((s) => ({ value: s.id, label: s.full_name, hint: s.email })),
    [students],
  );
  const courseOptions: SearchOption[] = useMemo(
    () =>
      courses.map((c) => {
        const taken = enrollments.filter(
          (e) => e.course_id === c.id && e.status === "active",
        ).length;
        const free = c.max_students - taken;
        return {
          value: c.id,
          label: c.name,
          hint: free > 0 ? `${free} cupos libres` : "Cupo lleno",
        };
      }),
    [courses, enrollments],
  );

  // Already enrolled? Say so before the server has to.
  const duplicate = enrollments.some(
    (e) => e.student_id === studentId && e.course_id === courseId && e.status !== "withdrawn",
  );

  const studentReady =
    studentMode === "new" ? Boolean(fullName.trim() && email.trim() && cuiPassport.trim()) : Boolean(studentId);
  const canSubmit = studentReady && Boolean(courseId) && !full && !duplicate;

  async function submit(force = false) {
    setError(null);
    setIsSubmitting(true);

    try {
      let finalStudentId = studentId;

      if (studentMode === "new") {
        const createdUser = await createUser.mutateAsync({
          role: "student",
          full_name: fullName.trim(),
          email: email.trim().toLowerCase(),
          cui_passport: cuiPassport.trim(),
          phone: phone.trim() || undefined,
          password: password || DEFAULT_PASSWORD,
        });
        finalStudentId = createdUser.id;
      }

      await createEnrollment.mutateAsync({
        student_id: finalStudentId,
        course_id: courseId,
        force,
      });

      notify(
        studentMode === "new"
          ? `Alumno ${fullName} creado e inscrito al curso con éxito`
          : "Alumno inscrito al curso correctamente",
        "success",
      );
      onClose();
    } catch (e) {
      setIsSubmitting(false);
      const detail = conflictDetail(e);
      if (detail?.reason === "student_schedule") {
        setClash(true);
        setError(detail.message);
      } else {
        setClash(false);
        setError(detail?.message ?? apiErrorMessage(e, "Error al procesar inscripción"));
      }
    }
  }

  const remainingHint = course
    ? full
      ? "Sin cupos disponibles"
      : `${remaining} ${remaining === 1 ? "cupo libre" : "cupos libres"} en ${course.name}`
    : undefined;

  return (
    <Modal
      title="Inscribir Alumno al Curso"
      description="Elige al alumno y su curso; el cupo y los horarios se comprueban al vuelo."
      onClose={onClose}
      maxWidth="max-w-xl"
      onSubmit={() => {
        if (canSubmit && !isSubmitting) submit(false);
      }}
      footer={
        <ModalActions hint={remainingHint}>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          {clash && (
            <Button variant="danger" disabled={isSubmitting} onClick={() => submit(true)}>
              Inscribir de todos modos
            </Button>
          )}
          <Button type="submit" disabled={!canSubmit || isSubmitting}>
            {isSubmitting ? "Procesando…" : "Inscribir al Curso"}
          </Button>
        </ModalActions>
      }
    >
      <div className="space-y-5 text-xs">

        {/* ── Step 1: Alumno ── */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-[10px] font-bold text-white">1</span>
              <span className="text-xs font-semibold text-slate-800">Alumno</span>
            </div>
            <div className="flex items-center rounded-lg bg-slate-100 p-0.5">
              <button
                type="button"
                onClick={() => setStudentMode("existing")}
                className={`rounded-md px-2.5 py-1 text-[11px] transition ${
                  studentMode === "existing"
                    ? "bg-white text-slate-900 shadow-2xs font-semibold"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                Ya registrado
              </button>
              <button
                type="button"
                onClick={() => setStudentMode("new")}
                className={`rounded-md px-2.5 py-1 text-[11px] transition ${
                  studentMode === "new"
                    ? "bg-white text-slate-900 shadow-2xs font-semibold"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                Nuevo alumno
              </button>
            </div>
          </div>

          {studentMode === "existing" ? (
            <SearchSelect
              options={studentOptions}
              value={studentId || null}
              onChange={(v) => setStudentId(Number(v))}
              placeholder="Buscar por nombre o correo…"
              emptyLabel="Ningún alumno coincide"
            />
          ) : (
            <div className="space-y-2.5 rounded-xl border border-slate-200/80 bg-slate-50/50 p-3">
              <Field label="Nombre completo (*)">
                <Input
                  placeholder="Ej. María Fernanda López"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </Field>
              <div className="grid gap-2.5 sm:grid-cols-2">
                <Field label="Correo electrónico (*)">
                  <Input
                    type="email"
                    placeholder="maria@ejemplo.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </Field>
                <Field label="CUI o Pasaporte (*)">
                  <Input
                    placeholder="Ej. 2540 12345 0101"
                    value={cuiPassport}
                    onChange={(e) => setCuiPassport(e.target.value)}
                  />
                </Field>
              </div>
              <Field label="Teléfono (opcional)">
                <Input
                  placeholder="+502 5555-5555"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </Field>
              {showAdvanced ? (
                <Field label="Contraseña inicial">
                  <Input
                    type="text"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </Field>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowAdvanced(true)}
                  className="text-[11px] font-medium text-brand-600 hover:text-brand-700 hover:underline"
                >
                  Cambiar contraseña inicial (por defecto {DEFAULT_PASSWORD})
                </button>
              )}
            </div>
          )}
        </section>

        {/* ── Step 2: Curso ── */}
        <section className="space-y-3 border-t border-slate-100 pt-4">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-[10px] font-bold text-white">2</span>
            <span className="text-xs font-semibold text-slate-800">Curso</span>
          </div>

          {initialCourseId && course ? (
            <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
              <span className="font-medium text-slate-900">{course.name}</span>
              <button
                type="button"
                onClick={() => setCourseId(0)}
                className="text-[11px] text-brand-600 hover:text-brand-700 hover:underline"
              >
                Cambiar
              </button>
            </div>
          ) : (
            <SearchSelect
              options={courseOptions}
              value={courseId || null}
              onChange={(v) => setCourseId(Number(v))}
              placeholder="Buscar un curso…"
              emptyLabel="Ningún curso coincide"
            />
          )}

          {course && (
            <div className="rounded-xl border border-slate-200/80 bg-slate-50/50 overflow-hidden">
              {/* Availability bar */}
              <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200/60">
                <span className="font-medium text-slate-700">Disponibilidad</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                    full ? "bg-red-100 text-red-700" : "bg-emerald-50 text-emerald-700"
                  }`}
                >
                  {full
                    ? "Sin cupos disponibles"
                    : `${remaining} cupo${remaining !== 1 ? "s" : ""} libre${remaining !== 1 ? "s" : ""}`}
                </span>
              </div>

              {/* Capacity micro-bar */}
              <div className="px-3 py-2 border-b border-slate-200/60">
                <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1">
                  <span>Inscritos: {activeInCourse}</span>
                  <span>Capacidad: {course.max_students}</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-slate-200">
                  <div
                    className={`h-1.5 rounded-full transition-all ${full ? "bg-red-500" : "bg-emerald-500"}`}
                    style={{ width: `${Math.min(100, (activeInCourse / course.max_students) * 100)}%` }}
                  />
                </div>
              </div>

              {/* Schedule info */}
              <div className="px-3 py-2">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                  Horarios asignados
                </span>
                {courseSchedules.length === 0 ? (
                  <p className="mt-1.5 text-[11px] italic text-slate-400">
                    Sin horario definido aún.
                  </p>
                ) : (
                  <div className="mt-1.5 space-y-1">
                    {courseSchedules.map((s) => (
                      <div
                        key={s.id}
                        className="flex items-center justify-between rounded-lg bg-white px-2.5 py-1.5 text-[11px] border border-slate-100"
                      >
                        <span className="font-medium text-slate-800">
                          {DAYS[s.day_of_week]} · {s.start_time.slice(0, 5)} – {s.end_time.slice(0, 5)}
                        </span>
                        <span className="rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700">
                          {teacherName(s.teacher_id)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        {/* ── Alerts ── */}
        {duplicate && (
          <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-amber-800">
            <span className="text-sm">⚠️</span>
            <span>{selectedStudent?.full_name ?? "Este alumno"} ya está inscrito en {course?.name}.</span>
          </div>
        )}

        {full && !duplicate && (
          <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-red-800">
            <span className="text-sm">🚫</span>
            <span>{course?.name} no tiene cupos disponibles.</span>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-amber-800">
            <span className="text-sm">⚠️</span>
            <span>{error}</span>
          </div>
        )}

      </div>
    </Modal>
  );
}
