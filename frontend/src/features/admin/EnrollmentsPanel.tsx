import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import {
  ActionMenu, Badge, Button, Card, ConfirmDialog, Input, Modal, ModalActions, Select,
} from "../../components/ui";
import { EnrollWizard } from "../enrollments/EnrollWizard";
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
} from "../../lib/types";
import { onMutationError } from "./shared";

const STATUS_LABELS = ENROLLMENT_LABELS as Record<EnrollmentStatus, string>;

export function EnrollmentsPanel() {
  const { data: enrollments = [] } = useEnrollments();
  const { data: courses = [] } = useCourses();
  const { data: students = [] } = useUsers("student");
  const deleteEnrollment = useDeleteEnrollment();

  const [wizardCourseId, setWizardCourseId] = useState<number | null | "new">(null);
  const [finances, setFinances] = useState<Enrollment | null>(null);
  const [transferEnrollment, setTransferEnrollment] = useState<Enrollment | null>(null);
  const [deleting, setDeleting] = useState<Enrollment | null>(null);

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
    <div className="space-y-4">
      {/* Executive Ultra-Clean Top Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600 font-bold text-lg">
            🎓
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-serif text-xl font-bold text-slate-900">
                Matrículas & Inscripciones
              </h2>
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                {enrollments.length} totales
              </span>
            </div>
            <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500">
              <span>🟢 Activas: <strong className="text-slate-800 font-semibold">{activeCount}</strong></span>
              <span>·</span>
              <span>🔴 En mora: <strong className="text-red-700 font-semibold">{overdueCount}</strong></span>
            </div>
          </div>
        </div>

        <Button
          className="bg-brand-600 hover:bg-brand-700 text-white font-semibold text-xs py-2 px-3.5 shadow-2xs"
          onClick={() => setWizardCourseId("new")}
        >
          + Nueva Inscripción
        </Button>
      </div>

      {/* Sleek Toolbar */}
      <div className="flex flex-col sm:flex-row gap-2.5 items-center justify-between bg-white p-3 rounded-2xl border border-slate-200/80 shadow-2xs text-xs">
        <div className="w-full sm:w-72">
          <Input
            placeholder="🔍 Buscar por alumno o código…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {/* Status Segmented Switcher */}
          <div className="flex items-center rounded-lg bg-slate-100 p-1 font-medium">
            <button
              onClick={() => setSelectedStatus("all")}
              className={`rounded-md px-2.5 py-1 transition ${
                selectedStatus === "all"
                  ? "bg-white text-slate-900 shadow-2xs font-semibold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Todas ({enrollments.length})
            </button>
            <button
              onClick={() => setSelectedStatus("active")}
              className={`rounded-md px-2.5 py-1 transition ${
                selectedStatus === "active"
                  ? "bg-white text-slate-900 shadow-2xs font-semibold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Activas ({activeCount})
            </button>
            <button
              onClick={() => setSelectedStatus("overdue")}
              className={`rounded-md px-2.5 py-1 transition ${
                selectedStatus === "overdue"
                  ? "bg-white text-red-700 shadow-2xs font-semibold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              En Mora ({overdueCount})
            </button>
          </div>

          <Select
            className="max-w-xs"
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
      </div>

      {wizardCourseId !== null && (
        <EnrollWizard
          initialCourseId={wizardCourseId === "new" ? undefined : wizardCourseId}
          onClose={() => setWizardCourseId(null)}
        />
      )}

      {/* Course-Grouped Enrollment List */}
      {filteredEnrollments.length === 0 ? (
        <Card className="py-12 text-center text-xs text-slate-400 italic">
          No se encontraron inscripciones con los criterios seleccionados.
        </Card>
      ) : (
        <div className="space-y-4">
          {Array.from(courseGroupMap.entries()).map(([cId, courseEnrollments]) => {
            const courseObj = courses.find((c) => c.id === cId);
            const courseTitle = courseObj?.name ?? `Curso #${cId}`;

            return (
              <Card key={cId} className="p-0 rounded-2xl border border-slate-200/80 bg-white shadow-2xs overflow-hidden">
                {/* Course Group Header */}
                <div className="flex items-center justify-between px-4 py-3 bg-slate-50/80 border-b border-slate-200/60">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-900 text-sm">{courseTitle}</span>
                    <span className="rounded-full bg-white border border-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                      {courseEnrollments.length} {courseEnrollments.length === 1 ? "alumno" : "alumnos"}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setWizardCourseId(cId)}
                    className="text-[11px] font-semibold text-brand-600 hover:text-brand-700 hover:underline transition"
                  >
                    + Inscribir alumno a este curso
                  </button>
                </div>

                {/* Enrollment Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-200/60 bg-slate-50/50 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                      <tr>
                        <th className="px-4 py-3">Código</th>
                        <th className="px-4 py-3">Alumno</th>
                        <th className="px-4 py-3">Estado</th>
                        <th className="px-4 py-3">Pago</th>
                        <th className="px-4 py-3">Asistencia</th>
                        <th className="px-4 py-3">Finanzas</th>
                        <th className="px-4 py-3 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {courseEnrollments.map((e) => {
                        const studentName = students.find((s) => s.id === e.student_id)?.full_name ?? `#${e.student_id}`;

                        return (
                          <tr key={e.id} className="hover:bg-slate-50/60 transition-colors">
                            <td className="px-4 py-3">
                              <span className="font-mono text-[11px] text-slate-500">{e.enrollment_code}</span>
                            </td>
                            <td className="px-4 py-3">
                              <span className="font-semibold text-slate-900">{studentName}</span>
                            </td>
                            <td className="px-4 py-3">
                              <StatusSelect enrollment={e} />
                            </td>
                            <td className="px-4 py-3">
                              <Badge
                                color={
                                  e.payment_status === "paid"
                                    ? "green"
                                    : e.payment_status === "overdue"
                                    ? "red"
                                    : "amber"
                                }
                              >
                                {e.payment_status === "paid" ? "Al día" : e.payment_status === "overdue" ? "En mora" : "Pendiente"}
                              </Badge>
                            </td>
                            <td className="px-4 py-3">
                              <AttendanceToggle enrollment={e} />
                            </td>
                            <td className="px-4 py-3">
                              <button
                                type="button"
                                onClick={() => setFinances(e)}
                                className="text-xs font-medium text-brand-600 hover:text-brand-800 hover:underline"
                              >
                                Pagos / Ledger
                              </button>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <ActionMenu
                                items={[
                                  {
                                    label: "Pagos / Historial Financial",
                                    onClick: () => setFinances(e),
                                  },
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
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
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
              . Esta acción no se puede deshacer.
            </>
          }
          busy={deleteEnrollment.isPending}
          onConfirm={() => confirmDelete(deleting)}
          onClose={() => setDeleting(null)}
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
  certified: "border-brand-200 bg-brand-50 text-brand-800",
  withdrawn: "border-red-200 bg-red-50 text-red-800",
};

function StatusSelect({ enrollment }: { enrollment: Enrollment }) {
  const update = useUpdateEnrollment();
  return (
    <Select
      aria-label="Estado de la matrícula"
      className={`min-w-[8rem] !py-1 text-xs font-semibold ${STATUS_SELECT_STYLES[enrollment.status]}`}
      value={enrollment.status}
      disabled={update.isPending}
      onChange={(e) =>
        update.mutate(
          { id: enrollment.id, status: e.target.value as EnrollmentStatus },
          { onError: onMutationError("No se pudo actualizar el estado") },
        )
      }
    >
      {(Object.keys(STATUS_LABELS) as EnrollmentStatus[]).map((s) => (
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
      className={`!px-2 !py-1 text-xs font-medium transition ${
        blocked ? "text-red-700 bg-red-50 border-red-200" : "text-emerald-700 bg-emerald-50 border-emerald-200"
      }`}
      disabled={update.isPending}
      onClick={() =>
        update.mutate(
          { id: enrollment.id, attendance_blocked: !blocked },
          { onError: onMutationError("No se pudo actualizar el bloqueo") },
        )
      }
    >
      {blocked ? "🚫 Bloqueado" : "✓ Permitido"}
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
      <div className="space-y-4 text-xs">
        <div>
          <label className="block text-slate-700 font-medium mb-1">Nuevo curso destino</label>
          <Select
            value={newCourseId}
            onChange={(e) => setNewCourseId(Number(e.target.value))}
          >
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} {c.id === enrollment.course_id ? "(Curso Actual)" : ""}
              </option>
            ))}
          </Select>
        </div>

        {selectedCourse && (
          <div className="rounded-lg bg-slate-50 p-3 space-y-2 border border-slate-200">
            <div className="flex items-center justify-between text-slate-700">
              <span>Fecha de Inicio:</span>
              <strong className="font-medium">{selectedCourse.start_date || "No definida"}</strong>
            </div>

            {hasStarted && (
              <div className="rounded border border-blue-200 bg-blue-50 p-2 text-[11px] text-blue-800 space-y-1">
                <p className="font-semibold">ℹ️ Este curso ya está en desarrollo</p>
                <ul className="list-disc list-inside space-y-0.5 text-blue-700">
                  <li>Se mantendrán intactos todos los pagos registrados previamente en la matrícula.</li>
                  <li>El alumno aparecerá inmediatamente en el portal docente y lista de asistencia del nuevo curso.</li>
                </ul>
              </div>
            )}
          </div>
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
      <div className="space-y-4 text-xs">
        {ledger && (
          <div className="grid grid-cols-3 gap-2 rounded-lg bg-slate-50 p-3 text-center border border-slate-200">
            <div>
              <span className="text-slate-500 block">Total:</span>
              <span className="font-semibold text-slate-900 text-sm">Q{ledger.charged.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-slate-500 block">Cobrado:</span>
              <span className="font-semibold text-emerald-700 text-sm">Q{ledger.paid.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-slate-500 block">Saldo:</span>
              <span className="font-semibold text-red-700 text-sm">Q{ledger.balance.toFixed(2)}</span>
            </div>
          </div>
        )}

        <div className="space-y-2 border-t border-slate-100 pt-3">
          <h4 className="font-semibold text-slate-800">Registrar Movimiento</h4>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-slate-600 mb-1">Tipo</label>
              <Select
                value={kind}
                onChange={(e) => setKind(e.target.value as PaymentKind)}
              >
                <option value="payment">Pago recibido</option>
                <option value="charge">Cobro / cuota</option>
              </Select>
            </div>
            <div>
              <label className="block text-slate-600 mb-1">Monto (Q)</label>
              <Input
                type="number"
                min="0"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
          </div>
          {isCharge ? (
            <div>
              <label className="block text-slate-600 mb-1">
                Vence el (opcional)
              </label>
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
              <p className="mt-1 text-[11px] text-slate-500">
                Pasada esta fecha sin cubrir, la matrícula queda en mora y se
                restringe el acceso a notas y certificados. Sin fecha, el cobro
                nunca vence por sí solo.
              </p>
            </div>
          ) : (
            <div>
              <label className="block text-slate-600 mb-1">Método</label>
              <Select value={method} onChange={(e) => setMethod(e.target.value)}>
                <option value="transfer">Transferencia</option>
                <option value="cash">Efectivo</option>
                <option value="card">Tarjeta</option>
              </Select>
            </div>
          )}
          <div>
            <label className="block text-slate-600 mb-1">Notas (opcional)</label>
            <Input
              placeholder="Ej. No. Boleta"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2 border-t border-slate-100 pt-3">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-slate-800">Facturas ({invoices.length})</h4>
            <Button
              variant="secondary"
              className="!py-1 text-xs"
              disabled={issueInvoice.isPending || (ledger?.paid ?? 0) <= 0}
              onClick={() =>
                issueInvoice.mutate(enrollment.id, {
                  onSuccess: () => notify("Factura emitida", "success"),
                  onError: (e) => notify(apiErrorMessage(e, "Error al facturar"), "error"),
                })
              }
            >
              + Emitir Factura
            </Button>
          </div>

          <div className="space-y-1 max-h-32 overflow-y-auto">
            {invoices.length === 0 ? (
              <p className="text-slate-400 italic">No hay facturas emitidas.</p>
            ) : (
              invoices.map((inv) => (
                <div
                  key={inv.id}
                  className="flex items-center justify-between rounded bg-slate-50 p-2 border border-slate-200"
                >
                  <span className="font-mono text-slate-700">{inv.code} · Q{inv.total_amount.toFixed(2)}</span>
                  <Button
                    variant="ghost"
                    className="!py-0.5 !px-2 text-xs"
                    onClick={() => downloadInvoicePdf(inv.id, inv.code)}
                  >
                    PDF 📄
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
