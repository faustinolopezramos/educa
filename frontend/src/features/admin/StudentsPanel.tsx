import { useMemo, useState } from "react";

import {
  Badge, Button, Card, ConfirmDialog, EmptyState, PageHeader, SearchInput,
  SegmentedControl, Table, Td, Th, Toolbar,
} from "../../components/ui";
import { IconUsers } from "../../components/icons";
import { useEnrollments, useNationalities, useUpdateUser, useUsers } from "../../lib/queries";
import { notify } from "../../lib/toast";
import { formatBalance, isCurrentEnrollment } from "../../lib/enrollment";
import type { Enrollment, User } from "../../lib/types";
import { onMutationError } from "./shared";
import { EnrollWizard } from "../enrollments/EnrollWizard";
import { Student360Drawer } from "./Student360Drawer";
import { CreateUserModal } from "./UsersPanel";

type Tab = "activos" | "sin_curso" | "morosos" | "baja" | "todos";

/**
 * A student's state is not stored — it is what their matrículas say.
 *
 * The system deliberately has no per-person academic status: the lifecycle
 * lives on the enrolment, so a student "is" whatever their enrolments make
 * them. That is the right model, but it left the admin with no way to answer
 * the questions they actually ask — who has no course right now, who owes
 * money — without opening enrolments one by one. This derives it.
 */
type DerivedStatus = "activo" | "sin_curso" | "moroso" | "egresado" | "baja";

const STATUS_LABELS: Record<DerivedStatus, string> = {
  activo: "Cursando",
  sin_curso: "Sin curso",
  moroso: "En mora",
  egresado: "Egresado",
  baja: "Cuenta de baja",
};

const STATUS_COLORS: Record<DerivedStatus, "green" | "amber" | "red" | "sky" | "slate"> = {
  activo: "green",
  sin_curso: "amber",
  moroso: "red",
  egresado: "sky",
  baja: "slate",
};

function deriveStatus(student: User, enrolments: Enrollment[]): DerivedStatus {
  if (!student.is_active) return "baja";
  const mine = enrolments.filter((e) => e.student_id === student.id);
  const current = mine.filter((e) => isCurrentEnrollment(e.status));
  // Money first: an admin looking at this column wants the problem, not the
  // happy label that also happens to be true.
  if (current.some((e) => e.payment_status === "overdue")) return "moroso";
  if (current.length > 0) return "activo";
  if (mine.some((e) => e.status === "certified")) return "egresado";
  return "sin_curso";
}

export function StudentsPanel() {
  const { data: students = [] } = useUsers("student");
  const { data: enrolments = [] } = useEnrollments();
  const { data: nationalities = [] } = useNationalities();
  const [tab, setTab] = useState<Tab>("activos");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  const [enrolling, setEnrolling] = useState(false);
  const [showCreateStudent, setShowCreateStudent] = useState(false);
  const [drawerStudent, setDrawerStudent] = useState<User | null>(null);
  const [deactivating, setDeactivating] = useState<User | null>(null);

  const update = useUpdateUser();

  const withStatus = useMemo(
    () => students.map((s) => ({ student: s, status: deriveStatus(s, enrolments) })),
    [students, enrolments],
  );

  const counts = useMemo(() => {
    const c = { activos: 0, sin_curso: 0, morosos: 0, baja: 0 };
    for (const { status } of withStatus) {
      if (status === "activo") c.activos += 1;
      else if (status === "sin_curso" || status === "egresado") c.sin_curso += 1;
      else if (status === "moroso") c.morosos += 1;
      else if (status === "baja") c.baja += 1;
    }
    return c;
  }, [withStatus]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return withStatus.filter(({ student, status }) => {
      if (tab === "activos" && status !== "activo") return false;
      if (tab === "sin_curso" && status !== "sin_curso" && status !== "egresado")
        return false;
      if (tab === "morosos" && status !== "moroso") return false;
      if (tab === "baja" && status !== "baja") return false;
      if (!term) return true;
      return (
        student.full_name.toLowerCase().includes(term) ||
        student.email.toLowerCase().includes(term) ||
        (student.cui_passport ?? "").toLowerCase().includes(term) ||
        (student.phone ?? "").toLowerCase().includes(term)
      );
    });
  }, [withStatus, tab, search]);

  const visibleIds = visible.map((v) => v.student.id);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selected.includes(id));

  function toggleAll() {
    setSelected((prev) =>
      allVisibleSelected
        ? prev.filter((id) => !visibleIds.includes(id))
        : [...new Set([...prev, ...visibleIds])],
    );
  }

  return (
    <div>
      <PageHeader
        title="Alumnos"
        description="Gestión integral de estudiantes, inscripciones y estado académico."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              onClick={() => setEnrolling(true)}
              disabled={selected.length === 0}
              title={
                selected.length === 0
                  ? "Marca al menos un alumno para matricular en lote"
                  : undefined
              }
            >
              Matricular {selected.length > 0 ? `(${selected.length})` : "en curso"}
            </Button>
            <Button onClick={() => setShowCreateStudent(true)}>
              + Nuevo Alumno
            </Button>
          </div>
        }
      />

      <Toolbar>
        <SegmentedControl
          value={tab}
          onChange={(v) => {
            setTab(v);
            // The selection belongs to what was on screen when it was made;
            // carrying it into another tab would act on rows nobody looked at.
            setSelected([]);
          }}
          options={[
            { value: "activos", label: "Cursando", count: counts.activos },
            { value: "sin_curso", label: "Sin curso", count: counts.sin_curso },
            { value: "morosos", label: "En mora", count: counts.morosos },
            { value: "baja", label: "De baja", count: counts.baja },
            { value: "todos", label: "Todos", count: students.length },
          ]}
        />
        <SearchInput
          className="w-full sm:ml-auto sm:w-72"
          placeholder="Buscar por nombre, correo, CUI o teléfono"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </Toolbar>

      {selected.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2.5 rounded-xl border border-brand-200 bg-brand-50 px-3 py-2">
          <span className="text-sm font-medium text-brand-900">
            {selected.length} alumno{selected.length === 1 ? "" : "s"} seleccionado
            {selected.length === 1 ? "" : "s"}
          </span>
          <Button size="sm" onClick={() => setEnrolling(true)}>
            Matricular en un curso
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelected([])}>
            Quitar selección
          </Button>
        </div>
      )}

      <Card padding="none" className="overflow-hidden">
        {visible.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={<IconUsers className="h-5 w-5" />}
              title={
                search ? "Nadie coincide con la búsqueda" : "No hay alumnos en esta vista"
              }
              message={
                search
                  ? "Prueba con otro nombre, correo, CUI o teléfono."
                  : "Cuando registres alumnos aparecerán aquí."
              }
              action={
                search ? (
                  <Button variant="secondary" onClick={() => setSearch("")}>
                    Limpiar búsqueda
                  </Button>
                ) : undefined
              }
            />
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>
                  <input
                    type="checkbox"
                    aria-label="Seleccionar todos los visibles"
                    className="h-4 w-4 rounded border-slate-300"
                    checked={allVisibleSelected}
                    onChange={toggleAll}
                  />
                </Th>
                <Th>Alumno</Th>
                <Th>Estado</Th>
                <Th>Cursos</Th>
                <Th align="right">Saldo</Th>
                <Th align="right">Acciones</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visible.map(({ student, status }) => {
                const mine = enrolments.filter((e) => e.student_id === student.id);
                const current = mine.filter((e) => isCurrentEnrollment(e.status));
                const owed = current.reduce((sum, e) => sum + Math.max(0, e.balance), 0);
                return (
                  <tr key={student.id} className="hover:bg-slate-50">
                    <Td>
                      <input
                        type="checkbox"
                        aria-label={`Seleccionar ${student.full_name}`}
                        className="h-4 w-4 rounded border-slate-300"
                        checked={selected.includes(student.id)}
                        onChange={(e) =>
                          setSelected((prev) =>
                            e.target.checked
                              ? [...prev, student.id]
                              : prev.filter((id) => id !== student.id),
                          )
                        }
                      />
                    </Td>
                    <Td>
                      <div className="font-medium text-slate-900">{student.full_name}</div>
                      <div className="mt-0.5 font-mono text-xs text-slate-500">
                        {student.email}
                      </div>
                    </Td>
                    <Td>
                      <Badge color={STATUS_COLORS[status]}>{STATUS_LABELS[status]}</Badge>
                    </Td>
                    <Td>
                      <span className="tabular text-sm text-slate-700">
                        {current.length}
                      </span>
                      {mine.length > current.length && (
                        <span className="ml-1 text-xs text-slate-400">
                          (+{mine.length - current.length} anteriores)
                        </span>
                      )}
                    </Td>
                    <Td align="right">
                      <span
                        className={
                          owed > 0.005
                            ? "tabular text-sm font-medium text-slate-900"
                            : "tabular text-sm text-slate-500"
                        }
                      >
                        {formatBalance(owed)}
                      </span>
                    </Td>
                    <Td align="right">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setDrawerStudent(student)}
                        >
                          Ver Ficha 360°
                        </Button>
                        {student.is_active ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeactivating(student)}
                          >
                            Dar de baja
                          </Button>
                        ) : (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() =>
                              update.mutate(
                                { id: student.id, is_active: true },
                                {
                                  onSuccess: () =>
                                    notify(
                                      `${student.full_name} vuelve a estar activo`,
                                      "success",
                                    ),
                                  onError: onMutationError("No se pudo reactivar"),
                                },
                              )
                            }
                          >
                            Reactivar
                          </Button>
                        )}
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      {/* Enroll Wizard */}
      {enrolling && (
        <EnrollWizard
          initialStudentIds={selected}
          onClose={() => {
            setEnrolling(false);
            setSelected([]);
          }}
        />
      )}

      {/* Quick Create Student Modal */}
      {showCreateStudent && (
        <CreateUserModal
          defaultRole="student"
          hideRoleSelect={true}
          nationalities={nationalities}
          onClose={() => setShowCreateStudent(false)}
        />
      )}

      {/* Unified 360 Drawer */}
      {drawerStudent && (
        <Student360Drawer
          student={drawerStudent}
          onClose={() => setDrawerStudent(null)}
          onMatricular={(studentId) => {
            setSelected([studentId]);
            setEnrolling(true);
          }}
        />
      )}
      {deactivating && (
        <ConfirmDialog
          title="Dar de baja al alumno"
          confirmLabel="Dar de baja"
          message={
            <>
              <strong>{deactivating.full_name}</strong> dejará de poder iniciar
              sesión. Sus matrículas, notas y asistencia se conservan tal cual — si
              lo que quieres es sacarlo de un curso, marca esa matrícula como{" "}
              <strong>Desistió</strong> en su lugar.
            </>
          }
          busy={update.isPending}
          onConfirm={() =>
            update.mutate(
              { id: deactivating.id, is_active: false },
              {
                onSuccess: () => {
                  notify(`${deactivating.full_name} quedó de baja`, "success");
                  setDeactivating(null);
                },
                onError: onMutationError("No se pudo dar de baja al alumno"),
              },
            )
          }
          onClose={() => setDeactivating(null)}
        />
      )}
    </div>
  );
}
