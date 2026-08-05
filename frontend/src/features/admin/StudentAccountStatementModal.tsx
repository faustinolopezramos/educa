import { useState } from "react";

import {
  Badge, Button, Modal, ModalActions, Select, Table, Td, Th, Input, Field,
} from "../../components/ui";
import { apiErrorMessage } from "../../lib/api";
import {
  useCourses,
  useCreatePayment,
  useEnrollmentLedger,
  useEnrollments,
} from "../../lib/queries";
import { notify } from "../../lib/toast";
import type { PaymentKind, User } from "../../lib/types";

export function StudentAccountStatementModal({
  student,
  onClose,
}: {
  student: User;
  onClose: () => void;
}) {
  const { data: enrollments = [] } = useEnrollments();
  const { data: courses = [] } = useCourses();

  // Find all enrollments belonging to this student
  const studentEnrollments = enrollments.filter((e) => e.student_id === student.id);

  const [selectedEnrollmentId, setSelectedEnrollmentId] = useState<number | null>(
    studentEnrollments.length > 0 ? studentEnrollments[0].id : null,
  );

  const activeEnrollment = studentEnrollments.find((e) => e.id === selectedEnrollmentId);
  const { data: ledger, isLoading: ledgerLoading } = useEnrollmentLedger(activeEnrollment?.id);
  const createPayment = useCreatePayment();

  // Quick Payment Registration inside modal
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentKind, setPaymentKind] = useState<PaymentKind>("payment");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("transfer");
  const [receiptNumber, setReceiptNumber] = useState("");
  const [notes, setNotes] = useState("");

  function handleRegisterPayment() {
    if (!activeEnrollment) return;
    const numAmount = Number(amount);
    if (!numAmount || numAmount <= 0) {
      notify("Monto inválido", "error");
      return;
    }

    createPayment.mutate(
      {
        enrollment_id: activeEnrollment.id,
        kind: paymentKind,
        amount: numAmount,
        method: paymentKind === "payment" ? method : undefined,
        receipt_number: receiptNumber.trim() || undefined,
        notes: notes.trim() || undefined,
      },
      {
        onSuccess: () => {
          setAmount("");
          setReceiptNumber("");
          setNotes("");
          setShowPaymentForm(false);
          notify("Movimiento financiero registrado correctamente", "success");
        },
        onError: (e) => notify(apiErrorMessage(e, "Error al registrar pago"), "error"),
      },
    );
  }

  // Calculate totals across all student's active enrollments
  const totalBalance = ledger?.balance ?? 0;
  const isOverdue = totalBalance > 0;

  return (
    <Modal
      title={`Estado de Cuenta · ${student.full_name}`}
      description="Resumen de saldos, cuotas e historial de transacciones financieras del alumno."
      onClose={onClose}
      maxWidth="max-w-3xl"
      footer={
        <ModalActions
          hint={
            ledger ? (
              <span className="font-semibold text-xs">
                Saldo de matrícula:{" "}
                <span className={totalBalance > 0 ? "text-red-700 font-mono" : "text-emerald-700 font-mono"}>
                  Q{totalBalance.toFixed(2)}
                </span>
              </span>
            ) : undefined
          }
        >
          <Button variant="secondary" onClick={onClose}>
            Cerrar
          </Button>
          {activeEnrollment && (
            <Button
              variant="primary"
              onClick={() => setShowPaymentForm(!showPaymentForm)}
            >
              {showPaymentForm ? "Ver Estado de Cuenta" : "+ Registrar Pago / Cobro"}
            </Button>
          )}
        </ModalActions>
      }
    >
      <div className="space-y-5 text-xs">
        {/* Student Profile Info Card */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4">
          <div>
            <div className="font-bold text-slate-900 text-sm">{student.full_name}</div>
            <div className="text-[11px] text-slate-500 font-mono flex flex-wrap items-center gap-2 mt-0.5">
              <span>{student.email}</span>
              {student.cui_passport && (
                <span className="rounded bg-white px-1.5 py-0.2 border border-slate-200 text-[10px] text-slate-700 font-semibold font-mono">
                  {student.cui_passport}
                </span>
              )}
              {student.phone && <span>· 📞 {student.phone}</span>}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge color={isOverdue ? "red" : "green"}>
              {isOverdue ? "Saldo Pendiente" : "Al Día"}
            </Badge>
          </div>
        </div>

        {/* Enrollment / Course Selector */}
        {studentEnrollments.length === 0 ? (
          <div className="py-8 text-center text-slate-400 italic">
            El alumno no cuenta con matrículas o cursos registrados.
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <label className="font-semibold text-slate-800 text-xs">Matrícula / Curso:</label>
              <Select
                className="max-w-md text-xs font-medium"
                value={selectedEnrollmentId ?? 0}
                onChange={(e) => setSelectedEnrollmentId(Number(e.target.value))}
              >
                {studentEnrollments.map((e) => {
                  const courseObj = courses.find((c) => c.id === e.course_id);
                  return (
                    <option key={e.id} value={e.id}>
                      {e.enrollment_code} — {courseObj?.name ?? `Curso #${e.course_id}`}
                    </option>
                  );
                })}
              </Select>
            </div>

            {/* Financial Ledger Summary Cards */}
            {ledger && (
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs">
                  <div className="text-[11px] text-slate-500 font-medium uppercase tracking-wider">
                    Total Cargado
                  </div>
                  <div className="mt-1 font-mono text-lg font-bold text-slate-900">
                    Q{ledger.charged.toFixed(2)}
                  </div>
                </div>

                <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/50 p-3.5 shadow-2xs">
                  <div className="text-[11px] text-emerald-800 font-medium uppercase tracking-wider">
                    Total Pagado
                  </div>
                  <div className="mt-1 font-mono text-lg font-bold text-emerald-700">
                    Q{ledger.paid.toFixed(2)}
                  </div>
                </div>

                <div className={`rounded-xl border p-3.5 shadow-2xs ${
                  ledger.balance > 0 ? "border-red-200/80 bg-red-50/50" : "border-slate-200 bg-white"
                }`}>
                  <div className={`text-[11px] font-medium uppercase tracking-wider ${
                    ledger.balance > 0 ? "text-red-800" : "text-slate-500"
                  }`}>
                    Saldo Restante
                  </div>
                  <div className={`mt-1 font-mono text-lg font-bold ${
                    ledger.balance > 0 ? "text-red-700" : "text-slate-900"
                  }`}>
                    Q{ledger.balance.toFixed(2)}
                  </div>
                </div>
              </div>
            )}

            {/* Registration Form toggle */}
            {showPaymentForm && (
              <div className="rounded-2xl border border-brand-200 bg-brand-50/40 p-4 space-y-3.5">
                <div className="font-bold text-slate-900 text-xs border-b border-brand-200/60 pb-2">
                  Registrar Nuevo Movimiento Financiero
                </div>
                <div className="grid grid-cols-4 gap-3">
                  <Field label="Tipo de Movimiento">
                    <Select
                      value={paymentKind}
                      onChange={(e) => setPaymentKind(e.target.value as PaymentKind)}
                    >
                      <option value="payment">Abono / Pago Recibido</option>
                      <option value="charge">Cobro / Cuota Asignada</option>
                    </Select>
                  </Field>

                  <Field label="Monto (Q)">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                    />
                  </Field>

                  {paymentKind === "payment" && (
                    <>
                      <Field label="Método de Pago">
                        <Select value={method} onChange={(e) => setMethod(e.target.value)}>
                          <option value="transfer">Transferencia Bancaria</option>
                          <option value="cash">Efectivo</option>
                          <option value="card">Tarjeta de Crédito/Débito</option>
                        </Select>
                      </Field>

                      <Field label="No. de Boleta / Ref.">
                        <Input
                          placeholder="Ej. 987654"
                          value={receiptNumber}
                          onChange={(e) => setReceiptNumber(e.target.value)}
                        />
                      </Field>
                    </>
                  )}
                </div>

                <Field label="Notas adicionales (opcional)">
                  <Input
                    placeholder="Ej. Depósito realizado en Banco Industrial"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </Field>

                <div className="flex justify-end gap-2 pt-1">
                  <Button variant="secondary" onClick={() => setShowPaymentForm(false)}>
                    Cancelar
                  </Button>
                  <Button
                    variant="primary"
                    disabled={createPayment.isPending || !amount}
                    onClick={handleRegisterPayment}
                  >
                    {createPayment.isPending ? "Guardando…" : "Confirmar Movimiento"}
                  </Button>
                </div>
              </div>
            )}

            {/* Statement Ledger Movements Table */}
            <div>
              <div className="font-semibold text-slate-800 text-xs mb-2">
                Historial de Movimientos Financieros
              </div>

              {ledgerLoading ? (
                <div className="py-6 text-center text-slate-400">Cargando estado de cuenta…</div>
              ) : !ledger || ledger.movements.length === 0 ? (
                <div className="py-8 text-center text-slate-400 italic bg-slate-50/50 rounded-xl border border-slate-200/60">
                  No existen movimientos financieros registrados para esta matrícula.
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white">
                  <Table>
                    <thead>
                      <tr>
                        <Th>Fecha</Th>
                        <Th>Tipo</Th>
                        <Th>Método</Th>
                        <Th>No. Boleta / Ref.</Th>
                        <Th>Notas</Th>
                        <Th>Monto</Th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {ledger.movements.map((m) => {
                        const isPayment = m.kind === "payment";
                        const dateStr = m.paid_at ? new Date(m.paid_at).toLocaleDateString("es-GT") : "—";
                        return (
                          <tr key={m.id} className="hover:bg-slate-50/60 transition-colors text-xs">
                            <Td>
                              <span className="font-mono text-slate-600">
                                {dateStr}
                              </span>
                            </Td>
                            <Td>
                              <Badge color={isPayment ? "green" : "amber"}>
                                {isPayment ? "Abono / Pago" : "Cobro / Cuota"}
                              </Badge>
                            </Td>
                            <Td>
                              <span className="font-medium text-slate-800">
                                {m.method === "transfer"
                                  ? "Transferencia"
                                  : m.method === "cash"
                                  ? "Efectivo"
                                  : m.method === "card"
                                  ? "Tarjeta"
                                  : "—"}
                              </span>
                            </Td>
                            <Td>
                              <span className="font-mono font-semibold text-slate-800">
                                {m.receipt_number ? `#${m.receipt_number}` : "—"}
                              </span>
                            </Td>
                            <Td>
                              <span className="text-slate-600 truncate max-w-xs block">
                                {m.notes || "—"}
                              </span>
                            </Td>
                            <Td>
                              <span
                                className={`font-mono font-bold text-xs ${
                                  isPayment ? "text-emerald-700" : "text-slate-900"
                                }`}
                              >
                                {isPayment ? `- Q${m.amount.toFixed(2)}` : `+ Q${m.amount.toFixed(2)}`}
                              </span>
                            </Td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </Table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
