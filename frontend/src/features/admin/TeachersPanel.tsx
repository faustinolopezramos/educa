import { useMemo, useState } from "react";

import {
  Badge, Button, Card, ConfirmDialog, EmptyState, Field, Modal, ModalActions,
  PageHeader, SearchInput, SegmentedControl, Select, Table, Td, Th, Toolbar,
} from "../../components/ui";
import { IconUsers } from "../../components/icons";
import {
  useCourses,
  useLanguages,
  useReassignTeacher,
  useTeacherAssignments,
  useTeacherLanguages,
  useUpdateUser,
  useUsers,
} from "../../lib/queries";
import { notify } from "../../lib/toast";
import { apiErrorMessage } from "../../lib/api";
import type { TeacherReassignOutcome, User } from "../../lib/types";
import { onMutationError } from "./shared";
import { BulkResultDialog, type BulkOutcome } from "./BulkResultDialog";
import { AssignTeacherModal } from "./AssignTeacherModal";
import { RegisterTeacherWizard } from "./RegisterTeacherWizard";

type Tab = "activos" | "baja" | "todos";

/**
 * The teaching staff, as its own screen.
 *
 * Teachers used to be a tab inside a generic "Usuarios" table, next to students
 * and admins, which meant the things that are specific to a teacher — what they
 * are qualified to teach, which courses they hold, handing those courses over —
 * had nowhere to live.
 *
 * The one flow this screen exists for: a teacher leaves. They cannot be deleted
 * (their schedules, grades and attendance reference them), so leaving is a
 * *baja* — and a baja is refused while they still hold live courses. That
 * refusal opens the handover, so the block is the entry point to the fix rather
 * than a dead end.
 */
export function TeachersPanel() {
  const { data: teachers = [] } = useUsers("teacher");
  const [tab, setTab] = useState<Tab>("activos");
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [reassigning, setReassigning] = useState<User | null>(null);
  const [deactivating, setDeactivating] = useState<User | null>(null);
  const [wizardTeacherId, setWizardTeacherId] = useState<number | null>(null);

  const update = useUpdateUser();

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return teachers.filter((t) => {
      if (tab === "activos" && !t.is_active) return false;
      if (tab === "baja" && t.is_active) return false;
      if (!term) return true;
      return (
        t.full_name.toLowerCase().includes(term) ||
        t.email.toLowerCase().includes(term)
      );
    });
  }, [teachers, tab, search]);

  const activeCount = teachers.filter((t) => t.is_active).length;
  const inactiveCount = teachers.length - activeCount;

  function reactivate(teacher: User) {
    update.mutate(
      { id: teacher.id, is_active: true },
      {
        onSuccess: () => notify(`${teacher.full_name} vuelve a estar activo`, "success"),
        onError: onMutationError("No se pudo reactivar al profesor"),
      },
    );
  }

  return (
    <div>
      <PageHeader
        title="Profesores"
        description="Quién puede impartir hoy, qué imparte, y a quién pasarle sus cursos."
        actions={<Button onClick={() => setCreating(true)}>Nuevo profesor</Button>}
      />

      <Toolbar>
        <SegmentedControl
          value={tab}
          onChange={setTab}
          options={[
            { value: "activos", label: "Activos", count: activeCount },
            { value: "baja", label: "De baja", count: inactiveCount },
            { value: "todos", label: "Todos", count: teachers.length },
          ]}
        />
        <SearchInput
          className="w-full sm:ml-auto sm:w-72"
          placeholder="Buscar por nombre o correo"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </Toolbar>

      <Card padding="none" className="overflow-hidden">
        {visible.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={<IconUsers className="h-5 w-5" />}
              title={
                search
                  ? "Ningún profesor coincide con la búsqueda"
                  : tab === "baja"
                    ? "No hay profesores de baja"
                    : "Todavía no hay profesores"
              }
              message={
                search
                  ? "Prueba con otro nombre o correo."
                  : tab === "baja"
                    ? "Cuando des de baja a alguien, aparecerá aquí y podrás reactivarlo."
                    : "Registra al primero para poder asignarle cursos."
              }
              action={
                search ? (
                  <Button variant="secondary" onClick={() => setSearch("")}>
                    Limpiar búsqueda
                  </Button>
                ) : (
                  tab !== "baja" && (
                    <Button onClick={() => setCreating(true)}>Nuevo profesor</Button>
                  )
                )
              }
            />
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Profesor</Th>
                <Th>Áreas Académicas</Th>
                <Th>Estado</Th>
                <Th>Carga</Th>
                <Th align="right">Acciones</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visible.map((t) => (
                <TeacherRow
                  key={t.id}
                  teacher={t}
                  onAssign={() => setWizardTeacherId(t.id)}
                  onReassign={() => setReassigning(t)}
                  onDeactivate={() => setDeactivating(t)}
                  onReactivate={() => reactivate(t)}
                />
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {creating && <RegisterTeacherWizard onClose={() => setCreating(false)} />}
      {/* Onboarding a brand-new teacher still walks the full wizard (account,
          qualifications, course, timetable). Assigning an existing one to
          another course is one step. */}
      {wizardTeacherId != null && (
        <AssignTeacherModal
          initialTeacherId={wizardTeacherId}
          onClose={() => setWizardTeacherId(null)}
        />
      )}
      {reassigning && (
        <ReassignModal teacher={reassigning} onClose={() => setReassigning(null)} />
      )}
      {deactivating && (
        <DeactivateFlow
          teacher={deactivating}
          onClose={() => setDeactivating(null)}
          onNeedsHandover={(t) => {
            setDeactivating(null);
            setReassigning(t);
          }}
        />
      )}
    </div>
  );
}

function TeacherRow({
  teacher,
  onAssign,
  onReassign,
  onDeactivate,
  onReactivate,
}: {
  teacher: User;
  onAssign: () => void;
  onReassign: () => void;
  onDeactivate: () => void;
  onReactivate: () => void;
}) {
  const { data: assignments = [] } = useTeacherAssignments(teacher.id);
  const { data: qualLangs = [] } = useTeacherLanguages(teacher.id);
  const { data: languages = [] } = useLanguages();
  const slots = assignments.reduce((n, a) => n + a.schedule_count, 0);

  return (
    <tr className="hover:bg-slate-50">
      <Td>
        <div className="font-medium text-slate-900">{teacher.full_name}</div>
        <div className="mt-0.5 font-mono text-xs text-slate-500">{teacher.email}</div>
      </Td>
      <Td>
        {qualLangs.length === 0 ? (
          <span className="text-xs text-slate-400">Todas las áreas</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {qualLangs.map((ql) => {
              const lang = languages.find((g) => g.id === ql.language_id);
              return (
                <Badge key={ql.language_id} color="indigo">
                  {lang ? lang.name : `#${ql.language_id}`}
                </Badge>
              );
            })}
          </div>
        )}
      </Td>
      <Td>
        <Badge color={teacher.is_active ? "green" : "slate"}>
          {teacher.is_active ? "Activo" : "De baja"}
        </Badge>
      </Td>
      <Td>
        {assignments.length === 0 ? (
          <span className="text-xs text-slate-400">Sin cursos activos</span>
        ) : (
          <span className="text-xs text-slate-700">
            {assignments.length} curso{assignments.length === 1 ? "" : "s"} ·{" "}
            <span className="tabular">{slots}</span> franja{slots === 1 ? "" : "s"}
          </span>
        )}
      </Td>
      <Td align="right">
        <div className="flex flex-wrap justify-end gap-1.5">
          {teacher.is_active ? (
            <>
              <Button variant="ghost" size="sm" onClick={onAssign}>
                Asignar curso
              </Button>
              {assignments.length > 0 && (
                <Button variant="ghost" size="sm" onClick={onReassign}>
                  Reasignar
                </Button>
              )}
              <Button variant="secondary" size="sm" onClick={onDeactivate}>
                Dar de baja
              </Button>
            </>
          ) : (
            <Button variant="secondary" size="sm" onClick={onReactivate}>
              Reactivar
            </Button>
          )}
        </div>
      </Td>
    </tr>
  );
}

/**
 * Deactivation, which the API refuses while the teacher still holds live
 * courses. The refusal is caught here and turned into the handover — so the
 * admin never has to work out for themselves what "reasígnalos primero" means.
 */
function DeactivateFlow({
  teacher,
  onClose,
  onNeedsHandover,
}: {
  teacher: User;
  onClose: () => void;
  onNeedsHandover: (t: User) => void;
}) {
  const update = useUpdateUser();
  const { data: assignments = [] } = useTeacherAssignments(teacher.id);

  if (assignments.length > 0) {
    return (
      <Modal
        title="Antes hay que reasignar sus cursos"
        description={`${teacher.full_name} todavía imparte clases activas.`}
        onClose={onClose}
        footer={
          <ModalActions>
            <Button variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={() => onNeedsHandover(teacher)}>Reasignar ahora</Button>
          </ModalActions>
        }
      >
        <p className="mb-3 text-sm text-slate-600">
          Una cuenta de baja no puede iniciar sesión, así que estos cursos se
          quedarían sin nadie que pueda pasar lista:
        </p>
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {assignments.map((a) => (
            <li
              key={a.course_id}
              className="flex items-center justify-between gap-2 px-3 py-2"
            >
              <span className="text-sm text-slate-900">{a.course_name}</span>
              <span className="tabular text-xs text-slate-500">
                {a.schedule_count} franja{a.schedule_count === 1 ? "" : "s"}
              </span>
            </li>
          ))}
        </ul>
      </Modal>
    );
  }

  return (
    <ConfirmDialog
      title="Dar de baja al profesor"
      message={
        <>
          <strong>{teacher.full_name}</strong> dejará de poder iniciar sesión y no
          aparecerá al asignar cursos ni horarios. Sus clases pasadas, sus notas y
          la asistencia que registró se conservan, y puedes reactivarlo cuando
          quieras.
        </>
      }
      busy={update.isPending}
      onConfirm={() =>
        update.mutate(
          { id: teacher.id, is_active: false },
          {
            onSuccess: () => {
              notify(`${teacher.full_name} quedó de baja`, "success");
              onClose();
            },
            onError: onMutationError("No se pudo dar de baja al profesor"),
          },
        )
      }
      onClose={onClose}
    />
  );
}

/** Hand a teacher's courses to another, reporting on each. */
function ReassignModal({ teacher, onClose }: { teacher: User; onClose: () => void }) {
  const { data: assignments = [] } = useTeacherAssignments(teacher.id);
  const { data: teachers = [] } = useUsers("teacher");
  const { data: courses = [] } = useCourses();
  const reassign = useReassignTeacher();

  const [toTeacherId, setToTeacherId] = useState(0);
  const [selected, setSelected] = useState<number[]>([]);
  const [result, setResult] = useState<TeacherReassignOutcome[] | null>(null);

  const candidates = teachers.filter((t) => t.id !== teacher.id && t.is_active);
  // Nothing picked means "all of them", which is what a handover usually is.
  const moving = selected.length > 0 ? selected : assignments.map((a) => a.course_id);

  function submit() {
    if (!toTeacherId) {
      notify("Elige a quién le pasas los cursos", "error");
      return;
    }
    reassign.mutate(
      {
        teacherId: teacher.id,
        to_teacher_id: toTeacherId,
        course_ids: selected.length > 0 ? selected : undefined,
      },
      {
        onSuccess: (r) => {
          setResult(r.outcomes);
          if (r.failed === 0) {
            notify(
              `${r.moved} curso${r.moved === 1 ? "" : "s"} reasignado${r.moved === 1 ? "" : "s"}`,
              "success",
            );
          }
        },
        onError: (e) =>
          notify(apiErrorMessage(e, "No se pudo reasignar"), "error"),
      },
    );
  }

  if (result) {
    return (
      <BulkResultDialog
        title="Resultado de la reasignación"
        successLabel="reasignado(s)"
        failureLabel="sin reasignar"
        outcomes={result.map<BulkOutcome>((o) => ({
          id: o.course_id,
          name: o.course_name,
          ok: o.ok,
          detail: o.ok
            ? `${o.schedules_moved} franja${o.schedules_moved === 1 ? "" : "s"}`
            : null,
          reason: o.reason,
        }))}
        onClose={() => {
          setResult(null);
          onClose();
        }}
      />
    );
  }

  return (
    <Modal
      title={`Reasignar los cursos de ${teacher.full_name}`}
      description="El profesor destino queda asignado al curso y hereda sus franjas."
      onClose={onClose}
      maxWidth="max-w-lg"
      footer={
        <ModalActions hint={`Se moverán ${moving.length} curso(s)`}>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={reassign.isPending || !toTeacherId}>
            {reassign.isPending ? "Reasignando…" : "Reasignar"}
          </Button>
        </ModalActions>
      }
    >
      <div className="space-y-4">
        <Field label="Pasar los cursos a">
          <Select
            value={toTeacherId}
            onChange={(e) => setToTeacherId(Number(e.target.value))}
          >
            <option value={0}>Elige un profesor…</option>
            {candidates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.full_name}
              </option>
            ))}
          </Select>
        </Field>

        <div>
          <p className="mb-2 text-sm font-medium text-slate-700">
            Cursos a mover{" "}
            <span className="font-normal text-slate-500">
              (ninguno marcado = todos)
            </span>
          </p>
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {assignments.map((a) => {
              const checked = selected.includes(a.course_id);
              const course = courses.find((c) => c.id === a.course_id);
              return (
                <li key={a.course_id} className="px-3 py-2">
                  <label className="flex cursor-pointer items-center gap-2.5">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300"
                      checked={checked}
                      onChange={(e) =>
                        setSelected((prev) =>
                          e.target.checked
                            ? [...prev, a.course_id]
                            : prev.filter((id) => id !== a.course_id),
                        )
                      }
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-slate-900">
                        {a.course_name}
                      </span>
                      <span className="tabular text-xs text-slate-500">
                        {a.schedule_count} franja{a.schedule_count === 1 ? "" : "s"}
                        {course && ` · ${course.seats_taken}/${course.max_students} alumnos`}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>

        <p className="text-xs text-slate-500">
          Si el destino no está cualificado para el idioma de un curso, o ya tiene
          otra clase a esa hora, ese curso se queda donde está y te lo indicamos —
          el resto sí se mueve.
        </p>
      </div>
    </Modal>
  );
}
