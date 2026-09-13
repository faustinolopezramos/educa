import { useMemo, useState } from "react";

import {
  Badge, Button, Field, Modal, ModalActions, SearchSelect,
} from "../../components/ui";
import type { SearchOption } from "../../components/ui";
import { apiErrorMessage } from "../../lib/api";
import { DAYS } from "../../lib/format";
import {
  useAssignCourseTeacher,
  useCourseTeachers,
  useCourses,
  useLanguages,
  useLevels,
  useSchedules,
  useTeacherLanguages,
  useUsers,
} from "../../lib/queries";
import { notify } from "../../lib/toast";

interface Props {
  initialCourseId?: number;
  initialTeacherId?: number;
  /** Opens the schedule builder once the assignment lands. */
  onCreateSchedule?: (courseId: number, teacherId: number) => void;
  onClose: () => void;
}

/**
 * Assigning a teacher to a course — just that.
 *
 * The only way to do this used to be a three-step wizard that also created the
 * teacher and built a timetable, so the most common act in the academy ("this
 * person teaches that course") required walking through slot pickers, day
 * toggles and room selection even when the timetable already existed or was
 * somebody else's job that afternoon.
 *
 * Assignment and scheduling are separate on the API — a teacher can be assigned
 * before any slot exists, and every slot requires an assignment first — so they
 * are separate here. Building the timetable is offered right afterwards for
 * whoever does want both.
 */
export function AssignTeacherModal({
  initialCourseId,
  initialTeacherId,
  onCreateSchedule,
  onClose,
}: Props) {
  const { data: courses = [] } = useCourses();
  const { data: teachers = [] } = useUsers("teacher");
  const { data: schedules = [] } = useSchedules();
  const { data: languages = [] } = useLanguages();
  const { data: levels = [] } = useLevels();
  const assign = useAssignCourseTeacher();

  const [courseId, setCourseId] = useState(initialCourseId ?? 0);
  const [teacherId, setTeacherId] = useState(initialTeacherId ?? 0);
  const [error, setError] = useState<string | null>(null);

  const { data: assigned = [] } = useCourseTeachers(courseId || undefined);
  const { data: qualifications = [] } = useTeacherLanguages(teacherId || undefined);

  const course = courses.find((c) => c.id === courseId);
  const teacher = teachers.find((t) => t.id === teacherId);
  const courseSchedules = schedules.filter((s) => s.course_id === courseId);

  // Determine course's language through level -> language
  const courseLevel = levels.find((l) => l.id === course?.level_id);
  const courseLanguage = languages.find((l) => l.id === courseLevel?.language_id);
  const teacherQualifiedLanguageIds = qualifications.map((q) => q.language_id);
  
  const hasQualifications = qualifications.length > 0;
  const hasCourseLanguage = Boolean(courseLanguage);
  const teacherHasCourseLanguage = courseLanguage 
    ? teacherQualifiedLanguageIds.includes(courseLanguage.id) 
    : false;
  
  // Warning states
  const noQualificationsWarning = hasCourseLanguage && !hasQualifications;
  const qualificationMismatchWarning = hasCourseLanguage && hasQualifications && !teacherHasCourseLanguage;

  const alreadyAssigned = assigned.some((a) => a.teacher_id === teacherId);

  const courseOptions: SearchOption[] = useMemo(
    () =>
      courses
        .filter((c) => c.status !== "archived")
        .map((c) => ({
          value: c.id,
          label: c.name,
          hint:
            c.teacher_count === 0
              ? "Sin profesor asignado"
              : `${c.teacher_count} profesor${c.teacher_count === 1 ? "" : "es"} · ${c.schedule_count} franja${c.schedule_count === 1 ? "" : "s"}`,
        })),
    [courses],
  );

  const teacherOptions: SearchOption[] = useMemo(
    () =>
      // Somebody on baja cannot log in, so assigning them produces a course
      // nobody can teach.
      teachers
        .filter((t) => t.is_active)
        .map((t) => ({ value: t.id, label: t.full_name, hint: t.email })),
    [teachers],
  );

  function submit() {
    setError(null);
    assign.mutate(
      { courseId, teacher_id: teacherId },
      {
        onSuccess: () => {
          notify(`${teacher?.full_name} quedó asignado a ${course?.name}`, "success");
          if (onCreateSchedule && courseSchedules.length === 0) {
            // A course with no timetable cannot open for enrolment, so the next
            // step is offered rather than left for the admin to remember.
            onCreateSchedule(courseId, teacherId);
            return;
          }
          onClose();
        },
        onError: (e) =>
          setError(apiErrorMessage(e, "No se pudo asignar al profesor")),
      },
    );
  }

  const teacherOtherSchedules = schedules.filter(
    (s) => s.teacher_id === teacherId && s.course_id !== courseId,
  );
  const hasCollision = courseSchedules.some((cs) =>
    teacherOtherSchedules.some(
      (os) =>
        os.day_of_week === cs.day_of_week &&
        os.start_time < cs.end_time &&
        os.end_time > cs.start_time,
    ),
  );

  const canSubmit = Boolean(courseId && teacherId) && !alreadyAssigned;

  return (
    <Modal
      title="Asignar profesor a un curso"
      description="Le da permiso para impartirlo. El horario se define aparte."
      onClose={onClose}
      maxWidth="max-w-lg"
      footer={
        <ModalActions
          hint={
            course && courseSchedules.length === 0
              ? "Este curso todavía no tiene horario"
              : undefined
          }
        >
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={!canSubmit || assign.isPending}>
            {assign.isPending ? "Asignando…" : "Asignar"}
          </Button>
        </ModalActions>
      }
    >
      <div className="space-y-4">
        <Field label="Curso" required={true}>
          <SearchSelect
            options={courseOptions}
            value={courseId || null}
            onChange={(v) => setCourseId(Number(v))}
            placeholder="Buscar un curso…"
            emptyLabel="Ningún curso coincide"
          />
        </Field>

        <Field label="Profesor" required={true}>
          <SearchSelect
            options={teacherOptions}
            value={teacherId || null}
            onChange={(v) => setTeacherId(Number(v))}
            placeholder="Buscar un profesor…"
            emptyLabel="Ningún profesor coincide"
          />
        </Field>

        {teacher && (
          <div className="space-y-2">
            {noQualificationsWarning && (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-900">
                <strong>⚠ Advertencia:</strong> Este profesor no tiene idiomas configurados.
                El sistema le permite impartir <strong>cualquier curso</strong> (incluido "{courseLanguage?.name}").
                Si esto no es intencional, configura sus idiomas antes de asignar.
              </p>
            )}
            {qualificationMismatchWarning && (
              <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs leading-relaxed text-red-900">
                <strong>⛔ Bloqueo:</strong> El curso es de <strong>{courseLanguage?.name}</strong>
                pero el profesor no tiene ese idioma en sus cualificaciones ({qualifications.map(q => languages.find(l => l.id === q.language_id)?.name).filter(Boolean).join(", ") || "ninguno"}).
                La asignación será rechazada por el servidor.
              </p>
            )}
            {!noQualificationsWarning && !qualificationMismatchWarning && hasCourseLanguage && (
              <p className="text-xs text-emerald-700">
                ✓ El profesor está cualificado para <strong>{courseLanguage?.name}</strong>.
              </p>
            )}
            {!hasCourseLanguage && (
              <p className="text-xs text-slate-500">
                El curso no tiene idioma asociado (sin nivel configurado).
              </p>
            )}
          </div>
        )}

        {course && (
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
              <span className="text-xs font-medium text-slate-600">
                Ya imparten este curso
              </span>
              <Badge color={assigned.length === 0 ? "amber" : "slate"}>
                {assigned.length === 0 ? "Nadie" : `${assigned.length}`}
              </Badge>
            </div>
            {assigned.length > 0 && (
              <ul className="divide-y divide-slate-100">
                {assigned.map((a) => (
                  <li key={a.id} className="px-3 py-1.5 text-xs text-slate-700">
                    {teachers.find((t) => t.id === a.teacher_id)?.full_name ??
                      `#${a.teacher_id}`}
                    {a.is_lead && <span className="ml-1.5 text-slate-400">· titular</span>}
                  </li>
                ))}
              </ul>
            )}
            <div className="border-t border-slate-100 px-3 py-2">
              <span className="text-2xs font-semibold uppercase tracking-wider text-slate-400">
                Horario
              </span>
              {courseSchedules.length === 0 ? (
                <p className="mt-1 text-xs text-amber-700">
                  Sin franjas. Al asignar te ofrecemos crearlas — sin horario el curso
                  no puede abrirse a matrícula.
                </p>
              ) : (
                <ul className="tabular mt-1 space-y-0.5 text-xs text-slate-700">
                  {courseSchedules.map((s) => (
                    <li key={s.id}>
                      {DAYS[s.day_of_week]} · {s.start_time.slice(0, 5)}–
                      {s.end_time.slice(0, 5)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {hasCollision && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-900">
            <strong>Advertencia de Traslape:</strong> {teacher?.full_name} ya imparte otro curso en este mismo horario semanal.
          </p>
        )}

        {alreadyAssigned && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
            {teacher?.full_name} ya está asignado a este curso.
          </p>
        )}

        {error && (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
