import { useMemo, useState } from "react";

import {
  Badge, Button, Field, Input, Modal, ModalActions, SearchSelect,
} from "../../components/ui";
import type { SearchOption } from "../../components/ui";
import { apiErrorMessage } from "../../lib/api";
import { DAYS } from "../../lib/format";
import {
  useBulkEnroll,
  useCourses,
  useEnrollments,
  useNationalities,
  usePublicTeachers,
  useSchedules,
  useUsers,
} from "../../lib/queries";
import { notify } from "../../lib/toast";
import type { BulkEnrollOutcome } from "../../lib/types";
import { BulkResultDialog, type BulkOutcome } from "../admin/BulkResultDialog";
import { CreateUserModal } from "../admin/UsersPanel";

interface Props {
  initialCourseId?: number;
  initialStudentId?: number;
  /** Pre-picked students, e.g. a multi-selection made in the students list. */
  initialStudentIds?: number[];
  onClose: () => void;
}

/**
 * Enrolling, as one screen that finishes the job.
 *
 * Three things used to make this harder than it is:
 *
 * 1. It offered *every* course, including drafts and closed ones, which the API
 *    now refuses — so the picker led straight into a 409.
 * 2. It counted free seats client-side over `status === "active"`, while the
 *    cupo counts anyone holding a seat. It therefore promised seats that were
 *    already taken, and the submit failed on capacity.
 * 3. It enrolled exactly one student and left the cuota for a second trip to
 *    Finanzas, so the common case — seat this group, charge them all the same —
 *    took one modal per person plus a visit to another screen.
 *
 * One student and twenty are now the same flow, and it reports per student
 * rather than failing the whole batch.
 */
export function EnrollWizard({
  initialCourseId,
  initialStudentId,
  initialStudentIds,
  onClose,
}: Props) {
  const { data: courses = [] } = useCourses();
  const { data: students = [] } = useUsers("student");
  const { data: teachers = [] } = usePublicTeachers();
  const { data: enrollments = [] } = useEnrollments();
  const { data: schedules = [] } = useSchedules();
  const { data: nationalities = [] } = useNationalities();

  const bulkEnroll = useBulkEnroll();

  const [picked, setPicked] = useState<number[]>(
    initialStudentIds ?? (initialStudentId ? [initialStudentId] : []),
  );
  const [courseId, setCourseId] = useState<number>(initialCourseId ?? 0);
  const [showNewStudent, setShowNewStudent] = useState(false);
  const [amount, setAmount] = useState("0");
  const [dueDate, setDueDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [clashOverride, setClashOverride] = useState(false);
  const [result, setResult] = useState<BulkEnrollOutcome[] | null>(null);

  // Only courses that would actually accept somebody.
  const enrollable = useMemo(
    () => courses.filter((c) => c.status === "open" || c.status === "in_progress"),
    [courses],
  );
  const course = enrollable.find((c) => c.id === courseId);

  // Straight from the API, counted the way the cupo is counted.
  const taken = course?.seats_taken ?? 0;
  const remaining = course ? course.max_students - taken : 0;

  const courseSchedules = schedules.filter((s) => s.course_id === courseId);
  const teacherName = (id: number) =>
    teachers.find((t) => t.id === id)?.full_name ?? "—";

  const alreadyIn = useMemo(() => {
    const set = new Set<number>();
    for (const e of enrollments) {
      if (e.course_id === courseId && e.status !== "withdrawn") set.add(e.student_id);
    }
    return set;
  }, [enrollments, courseId]);

  const studentOptions: SearchOption[] = useMemo(
    () =>
      students
        .filter((s) => s.is_active && !picked.includes(s.id))
        .map((s) => ({
          value: s.id,
          label: s.full_name,
          hint: alreadyIn.has(s.id) ? "Ya está en este curso" : s.email,
        })),
    [students, picked, alreadyIn],
  );

  const courseOptions: SearchOption[] = useMemo(
    () =>
      enrollable.map((c) => {
        const free = c.max_students - c.seats_taken;
        return {
          value: c.id,
          label: c.name,
          hint:
            free > 0
              ? `${free} cupo${free === 1 ? "" : "s"} libre${free === 1 ? "" : "s"}`
              : "Cupo lleno",
        };
      }),
    [enrollable],
  );

  const duplicates = picked.filter((id) => alreadyIn.has(id));
  const overCapacity = course ? picked.length > remaining : false;
  const canSubmit =
    picked.length > 0 && Boolean(courseId) && duplicates.length === 0 && !overCapacity;

  function addExisting(id: number) {
    setPicked((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }

  function submit(force = false) {
    setError(null);
    bulkEnroll.mutate(
      {
        course_id: courseId,
        student_ids: picked,
        amount: Number(amount) || 0,
        due_date: dueDate || null,
        force,
      },
      {
        onSuccess: (r) => {
          if (r.failed === 0) {
            notify(
              r.created === 1
                ? "Alumno inscrito correctamente"
                : `${r.created} alumnos inscritos correctamente`,
              "success",
            );
            onClose();
            return;
          }
          // A timetable clash is the one refusal an admin may legitimately
          // override, so offer that rather than only reporting it.
          if (r.outcomes.some((o) => !o.ok && /horario/i.test(o.reason ?? ""))) {
            setClashOverride(true);
          }
          setResult(r.outcomes);
        },
        onError: (e) =>
          setError(apiErrorMessage(e, "No se pudo completar la inscripción")),
      },
    );
  }

  if (result) {
    return (
      <BulkResultDialog
        title="Resultado de la inscripción"
        successLabel="inscrito(s)"
        failureLabel="sin inscribir"
        outcomes={result.map<BulkOutcome>((o) => ({
          id: o.student_id,
          name: o.student_name,
          ok: o.ok,
          detail: o.enrollment_code,
          reason: o.reason,
        }))}
        onClose={() => {
          setResult(null);
          onClose();
        }}
      />
    );
  }

  const hint = !course
    ? undefined
    : overCapacity
      ? `Sólo quedan ${remaining} cupo(s) y has elegido ${picked.length}`
      : `${remaining} cupo${remaining === 1 ? "" : "s"} libre${remaining === 1 ? "" : "s"} en ${course.name}`;

  return (
    <Modal
      title={picked.length > 1 ? `Inscribir ${picked.length} alumnos` : "Inscribir alumno"}
      description="Elige a quién y en qué curso. La cuota puede quedar para después."
      onClose={onClose}
      maxWidth="max-w-xl"
      footer={
        <ModalActions hint={hint}>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          {clashOverride && (
            <Button
              variant="danger"
              disabled={bulkEnroll.isPending}
              onClick={() => submit(true)}
            >
              Inscribir pese al choque
            </Button>
          )}
          <Button
            onClick={() => submit(false)}
            disabled={!canSubmit || bulkEnroll.isPending}
          >
            {bulkEnroll.isPending ? "Inscribiendo…" : "Inscribir"}
          </Button>
        </ModalActions>
      }
    >
      <div className="space-y-5">
        {/* ── Alumnos ── */}
        <section className="space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-slate-800">
              Alumnos {picked.length > 0 && `(${picked.length})`}
            </span>
            <button
              type="button"
              onClick={() => setShowNewStudent((v) => !v)}
              className="text-xs font-medium text-brand-600 hover:text-brand-700 hover:underline"
            >
              {showNewStudent ? "Cancelar registro" : "Registrar uno nuevo"}
            </button>
          </div>

          {picked.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {picked.map((id) => {
                const s = students.find((x) => x.id === id);
                const dupe = alreadyIn.has(id);
                return (
                  <span
                    key={id}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${
                      dupe
                        ? "border-amber-300 bg-amber-50 text-amber-900"
                        : "border-slate-200 bg-slate-50 text-slate-800"
                    }`}
                  >
                    {s?.full_name ?? `#${id}`}
                    {dupe && <span className="text-2xs">ya inscrito</span>}
                    <button
                      type="button"
                      aria-label={`Quitar a ${s?.full_name ?? id}`}
                      onClick={() => setPicked((p) => p.filter((x) => x !== id))}
                      className="text-slate-400 hover:text-slate-700"
                    >
                      ×
                    </button>
                  </span>
                );
              })}
            </div>
          )}

          <SearchSelect
            options={studentOptions}
            value={null}
            onChange={(v) => addExisting(Number(v))}
            placeholder="Buscar por nombre o correo y añadir…"
            emptyLabel="Ningún alumno coincide"
          />

          {/* Empty space after search */}
        </section>

        {/* ── Curso ── */}
        <section className="space-y-2.5 border-t border-slate-100 pt-4">
          <span className="text-sm font-semibold text-slate-800">Curso</span>

          {enrollable.length === 0 ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
              Ningún curso admite matrícula ahora mismo. Ábrelo desde{" "}
              <strong>Cursos</strong>: sólo los que están abiertos o en curso pueden
              recibir alumnos.
            </p>
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
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
                <span className="text-xs font-medium text-slate-600">Ocupación</span>
                <Badge color={remaining <= 0 ? "red" : remaining <= 2 ? "amber" : "green"}>
                  {remaining <= 0
                    ? "Cupo lleno"
                    : `${remaining} de ${course.max_students} libres`}
                </Badge>
              </div>
              <div className="px-3 py-2">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                  <div
                    className={`h-full rounded-full ${remaining <= 0 ? "bg-red-500" : "bg-emerald-500"}`}
                    style={{
                      width: `${Math.min(100, (taken / (course.max_students || 1)) * 100)}%`,
                    }}
                  />
                </div>
              </div>
              <div className="border-t border-slate-100 px-3 py-2">
                <span className="text-2xs font-semibold uppercase tracking-wider text-slate-400">
                  Horario
                </span>
                {courseSchedules.length === 0 ? (
                  <p className="mt-1 text-xs italic text-slate-400">
                    Sin horario definido.
                  </p>
                ) : (
                  <ul className="mt-1 space-y-1">
                    {courseSchedules.map((s) => (
                      <li
                        key={s.id}
                        className="tabular flex items-center justify-between gap-2 text-xs text-slate-700"
                      >
                        <span>
                          {DAYS[s.day_of_week]} · {s.start_time.slice(0, 5)}–
                          {s.end_time.slice(0, 5)}
                        </span>
                        <span className="text-slate-500">{teacherName(s.teacher_id)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </section>

        {/* ── Cuota ── */}
        <section className="space-y-2.5 border-t border-slate-100 pt-4">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm font-semibold text-slate-800">Cuota</span>
            <span className="text-xs text-slate-500">
              Igual para todos; ajustable después uno a uno
            </span>
          </div>
          <div className="grid gap-2.5 sm:grid-cols-2">
            <Field label="Monto por alumno">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </Field>
            <Field label="Vence el (opcional)">
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </Field>
          </div>
          <p className="text-xs text-slate-500">
            Déjalo en 0 si todavía no hay acuerdo: no se abre ningún cobro y la
            matrícula queda sin saldo.
          </p>
        </section>

        {duplicates.length > 0 && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
            Quita a quien ya está inscrito en este curso antes de continuar.
          </p>
        )}

        {overCapacity && (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800">
            Has elegido {picked.length} alumnos y sólo quedan {remaining} cupos. Quita a
            alguien o amplía el cupo del curso.
          </p>
        )}

        {error && (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800">
            {error}
          </p>
        )}
      </div>

      {showNewStudent && (
        <CreateUserModal
          defaultRole="student"
          hideRoleSelect={true}
          nationalities={nationalities}
          onCreated={(createdStudent) => {
            addExisting(createdStudent.id);
            setShowNewStudent(false);
          }}
          onClose={() => setShowNewStudent(false)}
        />
      )}
    </Modal>
  );
}
