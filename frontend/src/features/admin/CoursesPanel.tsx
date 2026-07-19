import { useState } from "react";

import {
  Button, Card, ConfirmDialog, Field, Input, Modal, Select, Table, Td, Th,
} from "../../components/ui";
import {
  useAddEvaluation, useAssignCourseTeacher, useCourseEvaluations, useCourseTeachers,
  useCourses, useCreateCourse, useDeleteCourse, useDeleteEvaluation, useLevels,
  useUnassignCourseTeacher, useUpdateCourse, useUsers,
} from "../../lib/queries";
import { notify } from "../../lib/toast";
import type { Course } from "../../lib/types";
import { onMutationError } from "./shared";

export function CoursesPanel() {
  const { data: courses = [] } = useCourses();
  const { data: levels = [] } = useLevels();
  const create = useCreateCourse();
  const del = useDeleteCourse();
  const [form, setForm] = useState({
    level_id: 0,
    name: "",
    max_students: 20,
    start_date: "",
    end_date: "",
  });
  const [editing, setEditing] = useState<Course | null>(null);
  const [toDelete, setToDelete] = useState<Course | null>(null);

  const levelCode = (id: number) => levels.find((l) => l.id === id)?.code ?? id;

  function submit() {
    if (form.max_students < 1) {
      notify("El cupo debe ser al menos 1", "error");
      return;
    }
    create.mutate(
      {
        ...form,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
      },
      {
        onSuccess: () => {
          setForm({ level_id: form.level_id, name: "", max_students: 20, start_date: "", end_date: "" });
          notify("Curso creado", "success");
        },
        onError: onMutationError("No se pudo crear el curso"),
      },
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-1">
        <h3 className="mb-3 font-medium">Nuevo curso</h3>
        <div className="space-y-3">
          <Field label="Nivel">
            <Select
              value={form.level_id}
              onChange={(e) => setForm({ ...form, level_id: Number(e.target.value) })}
            >
              <option value={0}>Selecciona nivel…</option>
              {levels.map((lv) => (
                <option key={lv.id} value={lv.id}>
                  {lv.code} · {lv.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Nombre del curso">
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <Field label="Máx. alumnos">
            <Input
              type="number"
              min={1}
              value={form.max_students}
              onChange={(e) =>
                setForm({ ...form, max_students: Number(e.target.value) })
              }
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Inicio (término)">
              <Input
                type="date"
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
              />
            </Field>
            <Field label="Fin (término)">
              <Input
                type="date"
                value={form.end_date}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
              />
            </Field>
          </div>
          <Button
            className="w-full"
            disabled={!form.level_id || !form.name}
            onClick={submit}
          >
            Crear curso
          </Button>
        </div>
      </Card>
      <Card className="lg:col-span-2">
        <Table>
          <thead>
            <tr>
              <Th>Curso</Th>
              <Th>Nivel</Th>
              <Th>Término</Th>
              <Th>Máx.</Th>
              <Th>Acciones</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {courses.map((c) => (
              <tr key={c.id}>
                <Td>{c.name}</Td>
                <Td>{levelCode(c.level_id)}</Td>
                <Td>
                  {c.start_date || c.end_date
                    ? `${c.start_date ?? "…"} → ${c.end_date ?? "…"}`
                    : "—"}
                </Td>
                <Td>{c.max_students}</Td>
                <Td>
                  <div className="flex gap-1">
                    <Button variant="ghost" onClick={() => setEditing(c)}>
                      Editar
                    </Button>
                    <Button variant="ghost" onClick={() => setToDelete(c)}>
                      Eliminar
                    </Button>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      {editing && (
        <EditCourseModal
          course={editing}
          levels={levels}
          onClose={() => setEditing(null)}
        />
      )}
      {toDelete && (
        <ConfirmDialog
          title="Eliminar curso"
          message={
            <>
              ¿Eliminar <strong>{toDelete.name}</strong>? Se borrarán sus horarios,
              matrículas, calificaciones y asistencias.
            </>
          }
          busy={del.isPending}
          onClose={() => setToDelete(null)}
          onConfirm={() =>
            del.mutate(toDelete.id, {
              onSuccess: () => {
                setToDelete(null);
                notify("Curso eliminado", "success");
              },
              onError: (e) => {
                setToDelete(null);
                onMutationError("No se pudo eliminar")(e);
              },
            })
          }
        />
      )}
    </div>
  );
}

function EditCourseModal({
  course,
  levels,
  onClose,
}: {
  course: Course;
  levels: { id: number; code: string; name: string }[];
  onClose: () => void;
}) {
  const update = useUpdateCourse();
  const [form, setForm] = useState({
    level_id: course.level_id,
    name: course.name,
    max_students: course.max_students,
    passing_score: course.passing_score,
    start_date: course.start_date ?? "",
    end_date: course.end_date ?? "",
  });

  function save() {
    update.mutate(
      {
        id: course.id,
        ...form,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
      },
      {
        onSuccess: () => {
          notify("Curso actualizado", "success");
          onClose();
        },
        onError: onMutationError("No se pudo actualizar"),
      },
    );
  }

  return (
    <Modal title="Editar curso" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Nivel">
          <Select
            value={form.level_id}
            onChange={(e) => setForm({ ...form, level_id: Number(e.target.value) })}
          >
            {levels.map((lv) => (
              <option key={lv.id} value={lv.id}>
                {lv.code} · {lv.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Nombre">
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Máx. alumnos">
            <Input
              type="number"
              min={1}
              value={form.max_students}
              onChange={(e) => setForm({ ...form, max_students: Number(e.target.value) })}
            />
          </Field>
          <Field label="Nota para aprobar (0–10)">
            <Input
              type="number"
              min={0}
              max={10}
              step={0.5}
              value={form.passing_score}
              onChange={(e) => setForm({ ...form, passing_score: Number(e.target.value) })}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Inicio">
            <Input
              type="date"
              value={form.start_date}
              onChange={(e) => setForm({ ...form, start_date: e.target.value })}
            />
          </Field>
          <Field label="Fin">
            <Input
              type="date"
              value={form.end_date}
              onChange={(e) => setForm({ ...form, end_date: e.target.value })}
            />
          </Field>
        </div>
        <CourseTeachersSection courseId={course.id} />
        <EvaluationWeightsSection courseId={course.id} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={update.isPending} onClick={save}>
            Guardar
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function CourseTeachersSection({ courseId }: { courseId: number }) {
  const { data: assigned = [] } = useCourseTeachers(courseId);
  const { data: teachers = [] } = useUsers("teacher");
  const assign = useAssignCourseTeacher();
  const unassign = useUnassignCourseTeacher();
  const [pick, setPick] = useState(0);

  const assignedIds = new Set(assigned.map((a) => a.teacher_id));
  const assignable = teachers.filter((t) => !assignedIds.has(t.id));

  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <h4 className="mb-2 text-sm font-medium text-slate-700">
        Profesores del curso
      </h4>
      {assigned.length === 0 ? (
        <p className="mb-2 text-xs text-slate-400">
          Nadie asignado aún. Asigna un profesor antes de crear su horario.
        </p>
      ) : (
        <ul className="mb-2 space-y-1">
          {assigned.map((a) => (
            <li
              key={a.id}
              className="flex items-center justify-between rounded bg-slate-50 px-2 py-1 text-sm"
            >
              <span>
                {a.teacher_name}
                {a.is_lead && <span className="ml-1 text-xs text-brand-600">· titular</span>}
              </span>
              <Button
                variant="ghost"
                className="px-2 py-0.5 text-xs"
                onClick={() =>
                  unassign.mutate(
                    { courseId, teacherId: a.teacher_id },
                    { onError: onMutationError("No se pudo quitar al profesor") },
                  )
                }
              >
                Quitar
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <Select value={pick} onChange={(e) => setPick(Number(e.target.value))}>
          <option value={0}>Añadir profesor…</option>
          {assignable.map((t) => (
            <option key={t.id} value={t.id}>
              {t.full_name}
            </option>
          ))}
        </Select>
        <Button
          variant="secondary"
          disabled={!pick || assign.isPending}
          onClick={() =>
            assign.mutate(
              { courseId, teacher_id: pick },
              {
                onSuccess: () => setPick(0),
                onError: onMutationError("No se pudo asignar (¿cualificación?)"),
              },
            )
          }
        >
          Asignar
        </Button>
      </div>
    </div>
  );
}

function EvaluationWeightsSection({ courseId }: { courseId: number }) {
  const { data: evals = [] } = useCourseEvaluations(courseId);
  const add = useAddEvaluation();
  const del = useDeleteEvaluation();
  const [name, setName] = useState("");
  const [weight, setWeight] = useState(1);

  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <h4 className="mb-1 text-sm font-medium text-slate-700">
        Pesos de evaluación
      </h4>
      <p className="mb-2 text-xs text-slate-400">
        Sin pesos, la nota final es el promedio simple. Los nombres deben coincidir
        con los de las evaluaciones (p. ej. «Nota del día», «Examen final»).
      </p>
      {evals.length > 0 && (
        <ul className="mb-2 space-y-1">
          {evals.map((ev) => (
            <li
              key={ev.id}
              className="flex items-center justify-between rounded bg-slate-50 px-2 py-1 text-sm"
            >
              <span>
                {ev.name} <span className="text-xs text-slate-400">×{ev.weight}</span>
              </span>
              <Button
                variant="ghost"
                className="px-2 py-0.5 text-xs"
                onClick={() =>
                  del.mutate(
                    { courseId, id: ev.id },
                    { onError: onMutationError("No se pudo eliminar") },
                  )
                }
              >
                Quitar
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <Input
          placeholder="Evaluación"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Input
          type="number"
          min={0}
          step={0.5}
          className="w-20"
          value={weight}
          onChange={(e) => setWeight(Number(e.target.value))}
        />
        <Button
          variant="secondary"
          disabled={!name.trim() || add.isPending}
          onClick={() =>
            add.mutate(
              { courseId, name, weight },
              {
                onSuccess: () => setName(""),
                onError: onMutationError("No se pudo añadir"),
              },
            )
          }
        >
          Añadir
        </Button>
      </div>
    </div>
  );
}
