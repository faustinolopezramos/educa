import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import {
  ActionMenu, Badge, Button, Card, ConfirmDialog, EmptyState, Field, InlineAlert, Input,
  MetaItem, Modal, ModalActions, PageHeader, SearchInput, SegmentedControl, Select,
  Table, Th, Td,
} from "../../components/ui";
import { IconClipboard } from "../../components/icons";
import { EnrollWizard } from "../enrollments/EnrollWizard";
import { Student360Drawer } from "./Student360Drawer";
import { RenewalRequestsCard } from "./RenewalRequestsCard";
import {
  useCourses,
  useCreatePayment,
  useDeleteEnrollment,
  useEnrollmentInvoices,
  useEnrollmentLedger,
  useEnrollments,
  useIssueInvoice,
  useUpdateEnrollment,
  useUsers,
  downloadInvoicePdf,
} from "../../lib/queries";
import { notify } from "../../lib/toast";
import { apiErrorMessage } from "../../lib/api";
import { ENROLLMENT_LABELS } from "../../lib/format";
import type {
  Course,
  Enrollment,
  EnrollmentStatus,
  PaymentKind,
  User,
} from "../../lib/types";
import { onMutationError } from "./shared";
import { useAuth } from "../../auth/AuthContext";
import { canManageEnrollments } from "../../lib/nav";
import { allowedTransitions, formatBalance, isTerminalStatus } from "../../lib/enrollment";

const STATUS_LABELS = ENROLLMENT_LABELS as Record<EnrollmentStatus, string>;

export function EnrollmentsPanel() {
  const { user } = useAuth();
  const { data: enrollments = [] } = useEnrollments();
  const { data: courses = [] } = useCourses();
  const { data: students = [] } = useUsers("student");
  const deleteEnrollment = useDeleteEnrollment();

  const [wizardCourseId, setWizardCourseId] = useState<number | null | "new">(null);
  const [finances, setFinances] = useState<Enrollment | null>(null);
  const [transferEnrollment, setTransferEnrollment] = useState<Enrollment | null>(null);
  const [deleting, setDeleting] = useState<Enrollment | null>(null);
  const [drawerStudent, setDrawerStudent] = useState<User | null>(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCourseId, setSelectedCourseId] = useState<number | "all">("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");

  // The command palette can jump straight into "new enrollment"; consume the
  // flag so a refresh or a back-navigation does not reopen the modal.
  const [params, setParams] = useSearchParams();
  const wantsNew = params.get("new") === "1";
  useEffect(() => {
    if (!wantsNew) return;
    setWizardCourseId("new");
    params.delete("new");
    setParams(params, { replace: true });
  }, [wantsNew, params, setParams]);

  const filteredEnrollments = enrollments.filter((e) => {
    if (selectedCourseId !== "all" && e.course_id !== selectedCourseId) return false;
    if (selectedStatus === "active" && e.status !== "active") return false;
    if (selectedStatus === "overdue" && e.payment_status !== "overdue") return false;
    if (selectedStatus === "paid" && e.payment_status !== "paid") return false;

    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    const stName = students.find((s) => s.id === e.student_id)?.full_name?.toLowerCase() || "";
    const code = e.enrollment_code?.toLowerCase() || "";
    const cName = courses.find((c) => c.id === e.course_id)?.name?.toLowerCase() || "";
    return stName.includes(term) || code.includes(term) || cName.includes(term);
  });

  const courseGroupMap = new Map<number, Enrollment[]>();
  for (const e of filteredEnrollments) {
    const list = courseGroupMap.get(e.course_id) || [];
    list.push(e);
    courseGroupMap.set(e.course_id, list);
  }

  const activeCount = enrollments.filter((e) => e.status === "active").length;
  const overdueCount = enrollments.filter((e) => e.payment_status === "overdue").length;

  function confirmDelete(enrollment: Enrollment) {
    deleteEnrollment.mutate(enrollment.id, {
      onSuccess: () => {
        setDeleting(null);
        notify("Inscripción eliminada con éxito", "success");
      },
      onError: (e) => {
        setDeleting(null);
        notify(apiErrorMessage(e, "Error al eliminar inscripción"), "error");
      },
    });
  }

  return (
    <div>
      <PageHeader
        title="Matrículas"
        meta={
          <>
            <MetaItem value={enrollments.length} label="matrículas" />
            <MetaItem value={activeCount} label="activas" />
            <span>
              <strong
                className={`font-semibold ${overdueCount > 0 ? "text-red-700" : "text-slate-900"}`}
              >
                {overdueCount}
              </strong>{" "}
              <span className="text-slate-500">en mora</span>
            </span>
          </>
        }
        actions={<Button onClick={() => setWizardCourseId("new")}>Nueva matrícula</Button>}
      />

      {canManageEnrollments(user) && <RenewalRequestsCard />}

      <div className="mb-4 flex flex-wrap items-center gap-2.5 rounded-xl border border-slate-200 bg-white p-2.5">
        <SearchInput
          className="w-full sm:w-64"
          placeholder="Buscar por alumno, código o curso"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <SegmentedControl
          value={selectedStatus}
          onChange={setSelectedStatus}
          options={[
            { value: "all", label: "Todas", count: enrollments.length },
            { value: "active", label: "Activas", count: activeCount },
            { value: "overdue", label: "En mora", count: overdueCount },
          ]}
        />
        <Select
          className="w-full sm:w-56"
          value={selectedCourseId}
          onChange={(e) =>
            setSelectedCourseId(e.target.value === "all" ? "all" : Number(e.target.value))
          }
        >
          <option value="all">Todos los cursos</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>

      {wizardCourseId !== null && (
        <EnrollWizard
          initialCourseId={wizardCourseId === "new" ? undefined : wizardCourseId}
          onClose={() => setWizardCourseId(null)}
        />
      )}

      {/* Course-Grouped Enrollment List */}
      {filteredEnrollments.length === 0 ? (
        <EmptyState
          icon={<IconClipboard className="h-5 w-5" />}
          title={
            enrollments.length === 0 ? "Todavía no hay matrículas" : "Ninguna matrícula coincide"
          }
          message={
            enrollments.length === 0
              ? "Inscribe al primer alumno para empezar a llevar asistencia y pagos."
              : "Prueba con otro curso, otro estado o limpia la búsqueda."
          }
          action={
            enrollments.length === 0 ? (
              <Button onClick={() => setWizardCourseId("new")}>Nueva matrícula</Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-4">
          {Array.from(courseGroupMap.entries()).map(([cId, courseEnrollments]) => {
            const courseObj = courses.find((c) => c.id === cId);
            const courseTitle = courseObj?.name ?? `Curso #${cId}`;

            return (
              <Card key={cId} padding="none" className="overflow-hidden">
                <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-2.5">
                  <div className="flex min-w-0 items-baseline gap-2">
                    <span className="truncate text-sm font-semibold text-slate-900">
                      {courseTitle}
                    </span>
                    <span className="flex-none text-xs text-slate-500">
                      {courseEnrollments.length}{" "}
                      {courseEnrollments.length === 1 ? "alumno" : "alumnos"}
                    </span>
                  </div>

                  <Button variant="ghost" size="sm" onClick={() => setWizardCourseId(cId)}>
                    Inscribir alumno
                  </Button>
                </div>

                <Table>
                  <thead>
                    <tr>
                      <Th>Código</Th>
                      <Th>Alumno</Th>
                      <Th>Estado</Th>
                      <Th>Pago</Th>
                      <Th align="right">Saldo</Th>
                      <Th>Asistencia</Th>
                      <Th align="right">Acciones</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {courseEnrollments.map((e) => {
                      const stObj = students.find((s) => s.id === e.student_id);
                      const studentName = stObj?.full_name ?? `#${e.student_id}`;

                      return (
                        <tr key={e.id} className="hover:bg-slate-50">
                          <Td>
                            <span className="font-mono text-xs text-slate-500">
                              {e.enrollment_code}
                            </span>
                          </Td>
                          <Td>
                            {stObj ? (
                              <button
                                type="button"
                                onClick={() => setDrawerStudent(stObj)}
                                className="font-medium text-slate-900 hover:text-brand-600 hover:underline text-left"
                              >
                                {studentName}
                              </button>
                            ) : (
                              <span className="font-medium text-slate-900">{studentName}</span>
                            )}
                          </Td>
                          <Td>
                            <StatusSelect enrollment={e} />
                          </Td>
                          <Td>
                            <Badge
                              color={
                                e.payment_status === "paid"
                                  ? "green"
                                  : e.payment_status === "overdue"
                                    ? "red"
                                    : "amber"
                              }
                            >
                              {e.payment_status === "paid"
                                ? "Al día"
                                : e.payment_status === "overdue"
                                  ? "En mora"
                                  : "Pendiente"}
                            </Badge>
                          </Td>
                          <Td align="right">
                            <span
                              className={
                                e.balance > 0.005
                                  ? "tabular text-sm font-medium text-slate-900"
                                  : "tabular text-sm text-slate-500"
                              }
                            >
                              {formatBalance(e.balance)}
                            </span>
                          </Td>
                          <Td>
                            <AttendanceToggle enrollment={e} />
                          </Td>
                          <Td align="right">
                            <ActionMenu
                              items={[
                                ...(stObj
                                  ? [
                                      {
                                        label: "Ficha 360° del Alumno",
                                        onClick: () => setDrawerStudent(stObj),
                                      },
                                    ]
                                  : []),
                                { label: "Pagos e historial", onClick: () => setFinances(e) },
                                {
                                  label: "Trasladar a otro curso",
                                  onClick: () => setTransferEnrollment(e),
                                },
                                {
                                  label: "Anular matrícula",
                                  onClick: () => setDeleting(e),
                                  danger: true,
                                },
                              ]}
                            />
                          </Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              </Card>
            );
          })}
        </div>
      )}

      {finances && (
        <FinancesModal enrollment={finances} onClose={() => setFinances(null)} />
      )}

      {transferEnrollment && (
        <TransferCourseModal
          enrollment={transferEnrollment}
          courses={courses}
          students={students}
          onClose={() => setTransferEnrollment(null)}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title="Anular inscripción"
          message={
            <>
              Se eliminará la inscripción{" "}
              <strong className="font-mono">{deleting.enrollment_code}</strong> de{" "}
              <strong>
                {students.find((s) => s.id === deleting.student_id)?.full_name ??
                  `#${deleting.student_id}`}
              </strong>
              {/* Deleting an enrollment cascades to everything hanging off it.
                  Saying "no se puede deshacer" without naming what goes leaves
                  the destructive part invisible until it has happened. */}
              , y con ella <strong>su asistencia, sus notas y todo su historial de
              pagos y comprobantes</strong>. Esta acción no se puede deshacer.
              {deleting.balance > 0.005 && (
                <>
                  {" "}
                  Esta matrícula tiene un saldo pendiente de{" "}
                  <strong>{deleting.balance.toFixed(2)}</strong>: al eliminarla, esa
                  deuda deja de aparecer en el sistema.
                </>
              )}
              {" "}Si el alumno simplemente abandonó el curso, márcalo como{" "}
              <strong>Desistió</strong> en vez de borrarlo: conserva el historial.
            </>
          }
          busy={deleteEnrollment.isPending}
          onConfirm={() => confirmDelete(deleting)}
          onClose={() => setDeleting(null)}
        />
      )}

      {drawerStudent && (
        <Student360Drawer
          student={drawerStudent}
          onClose={() => setDrawerStudent(null)}
          onMatricular={() => {
            setWizardCourseId("new");
          }}
        />
      )}
    </div>
  );
}

// The colour carries the status and the control changes it — one widget, not a
// badge sitting next to a dropdown that says the same word.
const STATUS_SELECT_STYLES: Record<EnrollmentStatus, string> = {
  enrolled: "border-slate-200 bg-slate-50 text-slate-700",
  active: "border-emerald-200 bg-emerald-50 text-emerald-800",
  inactive: "border-amber-200 bg-amber-50 text-amber-800",
  graduated: "border-brand-200 bg-brand-50 text-brand-800",
  withdrawn: "border-red-200 bg-red-50 text-red-800",
};

function StatusSelect({ enrollment }: { enrollment: Enrollment }) {
  const update = useUpdateEnrollment();
  // A finished matrícula has nowhere left to go, so the control stops being a
  // control — offering moves the API refuses only teaches people to expect
  // errors.
  const terminal = isTerminalStatus(enrollment.status);
  return (
    <Select
      aria-label="Estado de la matrícula"
      title={
        terminal
          ? `«${STATUS_LABELS[enrollment.status]}» es un estado final. Para readmitir al alumno, crea una matrícula nueva.`
          : undefined
      }
      className={`min-w-[8rem] !py-1 text-xs font-semibold ${STATUS_SELECT_STYLES[enrollment.status]}`}
      value={enrollment.status}
      disabled={update.isPending || terminal}
      onChange={(e) =>
        update.mutate(
          { id: enrollment.id, status: e.target.value as EnrollmentStatus },
          { onError: onMutationError("No se pudo actualizar el estado") },
        )
      }
    >
      {allowedTransitions(enrollment.status).map((s) => (
        <option key={s} value={s}>
          {STATUS_LABELS[s]}
        </option>
      ))}
    </Select>
  );
}

function AttendanceToggle({ enrollment }: { enrollment: Enrollment }) {
  const update = useUpdateEnrollment();
  const blocked = enrollment.attendance_blocked;
  return (
    <Button
      variant="secondary"
      size="sm"
      // El estado se lee en la palabra, no en un emoji cuyo color y forma
      // cambia entre sistemas operativos.
      className={blocked ? "border-red-200 bg-red-50 text-red-700" : ""}
      aria-pressed={!blocked}
      disabled={update.isPending}
      title={
        blocked
          ? "El alumno no puede registrar asistencia. Pulsa para permitirla."
          : "El alumno puede registrar asistencia. Pulsa para bloquearla."
      }
      onClick={() =>
        update.mutate(
          { id: enrollment.id, attendance_blocked: !blocked },
          { onError: onMutationError("No se pudo actualizar el bloqueo") },
        )
      }
    >
      {blocked ? "Bloqueada" : "Permitida"}
    </Button>
  );
}

function TransferCourseModal({
  enrollment,
  courses,
  students,
  onClose,
}: {
  enrollment: Enrollment;
  courses: Course[];
  students: { id: number; full_name: string }[];
  onClose: () => void;
}) {
  const update = useUpdateEnrollment();
  const [newCourseId, setNewCourseId] = useState(enrollment.course_id);
  const studentName = students.find((s) => s.id === enrollment.student_id)?.full_name ?? `#${enrollment.student_id}`;
  const selectedCourse = courses.find((c) => c.id === newCourseId);

  const hasStarted = selectedCourse?.start_date
    ? new Date(selectedCourse.start_date) <= new Date()
    : false;

  function handleTransfer() {
    if (newCourseId === enrollment.course_id) {
      notify("El alumno ya está en este curso", "error");
      return;
    }
    update.mutate(
      { id: enrollment.id, course_id: newCourseId },
      {
        onSuccess: () => {
          notify(`Alumno ${studentName} trasladado con éxito al nuevo curso`, "success");
          onClose();
        },
        onError: (e) => notify(apiErrorMessage(e, "Error al trasladar curso"), "error"),
      },
    );
  }

  return (
    <Modal
      title={`Trasladar a ${studentName}`}
      description={`Se reasigna la inscripción ${enrollment.enrollment_code} a otro curso, conservando sus pagos.`}
      onClose={onClose}
      onSubmit={handleTransfer}
      footer={
        <ModalActions>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="submit"
            disabled={update.isPending || newCourseId === enrollment.course_id}
          >
            {update.isPending ? "Trasladando…" : "Confirmar traslado"}
          </Button>
        </ModalActions>
      }
    >
      <div className="space-y-4">
        <Field
          label="Nuevo curso"
          required={true}
          hint={
            selectedCourse
              ? `Comienza el ${selectedCourse.start_date || "— fecha sin definir"}.`
              : undefined
          }
        >
          <Select value={newCourseId} onChange={(e) => setNewCourseId(Number(e.target.value))}>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.id === enrollment.course_id ? " — curso actual" : ""}
              </option>
            ))}
          </Select>
        </Field>

        {hasStarted && (
          <InlineAlert type="info" title="Este curso ya empezó">
            Los pagos registrados se conservan, y el alumno aparecerá de inmediato en la lista
            de asistencia del nuevo curso.
          </InlineAlert>
        )}
      </div>
    </Modal>
  );
}

function FinancesModal({
  enrollment,
  onClose,
}: {
  enrollment: Enrollment;
  onClose: () => void;
}) {
  const { data: ledger } = useEnrollmentLedger(enrollment.id);
  const { data: invoices = [] } = useEnrollmentInvoices(enrollment.id);
  const createPayment = useCreatePayment();
  const issueInvoice = useIssueInvoice();

  const [kind, setKind] = useState<PaymentKind>("payment");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("transfer");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");

  const isCharge = kind === "charge";

  function submitPayment() {
    const num = Number(amount);
    if (!num || num <= 0) {
      notify("Monto inválido", "error");
      return;
    }
    createPayment.mutate(
      {
        enrollment_id: enrollment.id,
        kind,
        amount: num,
        // A method describes money coming in; a charge has none. A due date is
        // the mirror image — it only means anything on what is owed.
        method: isCharge ? undefined : method || undefined,
        due_date: isCharge ? dueDate || undefined : undefined,
        notes: notes || undefined,
      },
      {
        onSuccess: () => {
          setAmount("");
          setNotes("");
          setDueDate("");
          notify(
            isCharge ? "Cobro registrado con éxito" : "Pago registrado con éxito",
            "success",
          );
        },
        onError: (e) => notify(apiErrorMessage(e, "Error al registrar el movimiento"), "error"),
      },
    );
  }

  return (
    <Modal
      title={`Finanzas · ${enrollment.enrollment_code}`}
      description="Registra pagos y cobros, y emite facturas de lo ya cobrado."
      onClose={onClose}
      onSubmit={submitPayment}
      footer={
        <ModalActions
          hint={
            ledger
              ? `Saldo pendiente: Q${ledger.balance.toFixed(2)}`
              : undefined
          }
        >
          <Button variant="secondary" onClick={onClose}>
            Cerrar
          </Button>
          <Button type="submit" disabled={createPayment.isPending || !amount}>
            {createPayment.isPending
              ? "Registrando…"
              : isCharge
                ? "Registrar cobro"
                : "Registrar pago"}
          </Button>
        </ModalActions>
      }
    >
      <div className="space-y-5">
        {ledger && (
          <div className="grid grid-cols-3 divide-x divide-slate-200 rounded-xl border border-slate-200 bg-slate-50">
            <div className="px-3 py-2.5">
              <div className="text-xs text-slate-500">Cobrado</div>
              <div className="tabular text-base font-bold text-slate-900">
                Q{ledger.charged.toFixed(2)}
              </div>
            </div>
            <div className="px-3 py-2.5">
              <div className="text-xs text-slate-500">Pagado</div>
              <div className="tabular text-base font-bold text-emerald-700">
                Q{ledger.paid.toFixed(2)}
              </div>
            </div>
            <div className="px-3 py-2.5">
              <div className="text-xs text-slate-500">Saldo</div>
              <div
                className={`tabular text-base font-bold ${
                  ledger.balance > 0 ? "text-red-700" : "text-slate-900"
                }`}
              >
                Q{ledger.balance.toFixed(2)}
              </div>
            </div>
          </div>
        )}

        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-slate-900">Registrar movimiento</h4>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tipo" required={true}>
              <Select value={kind} onChange={(e) => setKind(e.target.value as PaymentKind)}>
                <option value="payment">Pago recibido</option>
                <option value="charge">Cobro / cuota</option>
              </Select>
            </Field>
            <Field label="Monto (Q)" required={true}>
              <Input
                type="number"
                min="0"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </Field>
          </div>
          {isCharge ? (
            <Field
              label="Vence el (opcional)"
              hint="Pasada esta fecha sin cubrir, la matrícula queda en mora y se restringe el acceso a las notas. Sin fecha, el cobro no vence por sí solo."
            >
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </Field>
          ) : (
            <Field label="Método">
              <Select value={method} onChange={(e) => setMethod(e.target.value)}>
                <option value="transfer">Transferencia</option>
                <option value="cash">Efectivo</option>
                <option value="card">Tarjeta</option>
              </Select>
            </Field>
          )}
          <Field label="Notas (opcional)">
            <Input
              placeholder="Ej. No. de boleta"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
        </div>

        <div className="space-y-2 border-t border-slate-100 pt-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-slate-900">
              Facturas{invoices.length > 0 && ` (${invoices.length})`}
            </h4>
            <Button
              variant="secondary"
              size="sm"
              disabled={issueInvoice.isPending || (ledger?.paid ?? 0) <= 0}
              title={
                (ledger?.paid ?? 0) <= 0 ? "Solo se factura lo ya cobrado" : undefined
              }
              onClick={() =>
                issueInvoice.mutate(enrollment.id, {
                  onSuccess: () => notify("Factura emitida", "success"),
                  onError: (e) => notify(apiErrorMessage(e, "Error al facturar"), "error"),
                })
              }
            >
              Emitir factura
            </Button>
          </div>

          <div className="max-h-32 space-y-1 overflow-y-auto">
            {invoices.length === 0 ? (
              <p className="text-xs text-slate-500">Todavía no se ha emitido ninguna factura.</p>
            ) : (
              invoices.map((inv) => (
                <div
                  key={inv.id}
                  className="flex items-center justify-between rounded-lg border border-slate-200 px-2.5 py-1.5"
                >
                  <span className="font-mono text-xs text-slate-700">
                    {inv.code} · Q{inv.total_amount.toFixed(2)}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => downloadInvoicePdf(inv.id, inv.code)}
                  >
                    Descargar PDF
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
