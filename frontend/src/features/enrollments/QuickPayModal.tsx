import { useEffect, useMemo, useState } from "react";
import {
  Badge,
  Button,
  Field,
  Input,
  Modal,
  ModalActions,
  SearchInput,
  Select,
} from "../../components/ui";
import {
  useCourses,
  useCreatePayment,
  useEnrollmentLedger,
  useEnrollments,
  useUsers,
} from "../../lib/queries";
import { notify } from "../../lib/toast";
import { apiErrorMessage } from "../../lib/api";
import { useMoney } from "../../lib/useMoney";
import type { Enrollment, User } from "../../lib/types";
import { PaymentReceiptModal, type ReceiptData } from "./PaymentReceiptModal";

export const OPEN_QUICK_PAY_EVENT = "educa:open-quick-pay";

export function openQuickPay(detail?: { studentId?: number; enrollmentId?: number }) {
  document.dispatchEvent(new CustomEvent(OPEN_QUICK_PAY_EVENT, { detail }));
}

export function QuickPayModal({
  initialStudentId,
  initialEnrollmentId,
  onClose,
}: {
  initialStudentId?: number;
  initialEnrollmentId?: number;
  onClose: () => void;
}) {
  const { money, symbol } = useMoney();
  const { data: students = [] } = useUsers("student");
  const { data: enrollments = [] } = useEnrollments();
  const { data: courses = [] } = useCourses();
  const createPayment = useCreatePayment();

  const [studentSearch, setStudentSearch] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<User | null>(() => {
    if (initialStudentId) {
      return students.find((s) => s.id === initialStudentId) ?? null;
    }
    return null;
  });

  // If initialStudentId was passed but students array wasn't loaded yet
  useEffect(() => {
    if (initialStudentId && !selectedStudent && students.length > 0) {
      const found = students.find((s) => s.id === initialStudentId);
      if (found) setSelectedStudent(found);
    }
  }, [initialStudentId, selectedStudent, students]);

  // Student enrollments
  const studentEnrollments = useMemo(() => {
    if (!selectedStudent) return [];
    return enrollments.filter((e) => e.student_id === selectedStudent.id);
  }, [selectedStudent, enrollments]);

  const [selectedEnrollmentId, setSelectedEnrollmentId] = useState<number | null>(() => {
    if (initialEnrollmentId) return initialEnrollmentId;
    return null;
  });

  // Auto-select enrollment if there's only 1 or initialEnrollmentId provided
  useEffect(() => {
    if (studentEnrollments.length === 1 && !selectedEnrollmentId) {
      setSelectedEnrollmentId(studentEnrollments[0].id);
    } else if (
      initialEnrollmentId &&
      studentEnrollments.some((e) => e.id === initialEnrollmentId)
    ) {
      setSelectedEnrollmentId(initialEnrollmentId);
    }
  }, [studentEnrollments, selectedEnrollmentId, initialEnrollmentId]);

  const activeEnrollment = studentEnrollments.find((e) => e.id === selectedEnrollmentId);
  const { data: ledger } = useEnrollmentLedger(activeEnrollment?.id);

  // Form inputs
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [notes, setNotes] = useState("");
  const [receiptNumber, setReceiptNumber] = useState("");
  const [showReceiptAfter, setShowReceiptAfter] = useState(true);
  const [completedReceipt, setCompletedReceipt] = useState<ReceiptData | null>(null);

  // Filter students for the search step
  const matchedStudents = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    if (!q) return students.slice(0, 8);
    return students
      .filter(
        (s) =>
          s.full_name.toLowerCase().includes(q) ||
          s.email.toLowerCase().includes(q) ||
          (s.phone ?? "").toLowerCase().includes(q) ||
          (s.cui_passport ?? "").toLowerCase().includes(q),
      )
      .slice(0, 10);
  }, [students, studentSearch]);

  const courseForEnrollment = (e: Enrollment) =>
    courses.find((c) => c.id === e.course_id)?.name ?? `Curso #${e.course_id}`;

  function handleSelectStudent(s: User) {
    setSelectedStudent(s);
    setStudentSearch("");
    const hisEnrolls = enrollments.filter((e) => e.student_id === s.id);
    if (hisEnrolls.length === 1) {
      setSelectedEnrollmentId(hisEnrolls[0].id);
    } else {
      setSelectedEnrollmentId(null);
    }
  }

  function handleFillBalance() {
    if (ledger && ledger.balance > 0) {
      setAmount(String(ledger.balance));
    }
  }

  function handleSubmit() {
    if (!activeEnrollment) {
      notify("Selecciona una matrícula para aplicar el pago", "error");
      return;
    }
    const num = Number(amount);
    if (!num || num <= 0) {
      notify("Ingresa un monto válido mayor a 0", "error");
      return;
    }

    createPayment.mutate(
      {
        enrollment_id: activeEnrollment.id,
        kind: "payment",
        amount: num,
        method,
        receipt_number: receiptNumber.trim() || undefined,
        notes: notes.trim() || undefined,
      },
      {
        onSuccess: (paymentResp) => {
          notify(`Pago de ${money(num)} registrado exitosamente en caja`, "success");
          if (showReceiptAfter) {
            const courseName = courseForEnrollment(activeEnrollment);
            const prevBal = ledger?.balance ?? 0;
            const remainingBal = Math.max(0, prevBal - num);
            setCompletedReceipt({
              receiptNumber: paymentResp?.receipt_number || paymentResp?.id || receiptNumber || null,
              studentName: selectedStudent?.full_name ?? "",
              studentEmail: selectedStudent?.email,
              studentPhone: selectedStudent?.phone,
              studentCui: selectedStudent?.cui_passport,
              courseName,
              enrollmentCode: activeEnrollment.enrollment_code,
              amount: num,
              method,
              notes: notes.trim() || null,
              date: new Date().toISOString(),
              previousBalance: prevBal,
              remainingBalance: remainingBal,
            });
          } else {
            onClose();
          }
        },
        onError: (e) => notify(apiErrorMessage(e, "Error al registrar pago en caja"), "error"),
      },
    );
  }

  // If receipt is ready to view/print
  if (completedReceipt) {
    return <PaymentReceiptModal receipt={completedReceipt} onClose={onClose} />;
  }

  return (
    <Modal
      title="Cobro Rápido en Caja · Ventanilla"
      description="Registra pagos y abonos de alumnos en segundos y genera el comprobante de caja."
      onClose={onClose}
      maxWidth="max-w-2xl"
      footer={
        <ModalActions
          hint={
            activeEnrollment && ledger
              ? `Saldo adeudado: ${money(ledger.balance)}`
              : undefined
          }
        >
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!activeEnrollment || !amount || createPayment.isPending}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {createPayment.isPending ? "Registrando…" : "Registrar Cobro en Caja"}
          </Button>
        </ModalActions>
      }
    >
      <div className="space-y-4">
        {/* Step 1: Student selection */}
        {!selectedStudent ? (
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">
              1. Buscar Alumno en Mostrador
            </label>
            <SearchInput
              autoFocus
              placeholder="Escribe nombre, correo, DPI/CUI o teléfono..."
              value={studentSearch}
              onChange={(e) => setStudentSearch(e.target.value)}
              className="w-full"
            />

            <div className="mt-3 max-h-56 space-y-1.5 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/50 p-1.5">
              {matchedStudents.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-500">
                  No se encontraron alumnos con esa búsqueda.
                </div>
              ) : (
                matchedStudents.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => handleSelectStudent(s)}
                    className="flex w-full items-center justify-between rounded-lg border border-transparent bg-white p-2.5 text-left shadow-2xs transition-colors hover:border-brand-300 hover:bg-brand-50/50"
                  >
                    <div>
                      <div className="text-xs font-semibold text-slate-900">{s.full_name}</div>
                      <div className="text-2xs text-slate-500">
                        {s.email}
                        {s.cui_passport ? ` · DPI: ${s.cui_passport}` : ""}
                        {s.phone ? ` · Tel: ${s.phone}` : ""}
                      </div>
                    </div>
                    <span className="text-xs font-medium text-brand-700">Seleccionar →</span>
                  </button>
                ))
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-2xs font-semibold uppercase tracking-wider text-slate-500">
                  Alumno seleccionado
                </span>
                <div className="text-sm font-bold text-slate-900">{selectedStudent.full_name}</div>
                <div className="text-xs text-slate-500">
                  {selectedStudent.email}
                  {selectedStudent.cui_passport ? ` · DPI: ${selectedStudent.cui_passport}` : ""}
                  {selectedStudent.phone ? ` · Tel: ${selectedStudent.phone}` : ""}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelectedStudent(null);
                  setSelectedEnrollmentId(null);
                  setAmount("");
                }}
              >
                Cambiar alumno
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Course / Enrollment selection */}
        {selectedStudent && (
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">
              2. Matrícula / Curso a Abonar
            </label>
            {studentEnrollments.length === 0 ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                Este alumno no tiene matrículas activas o registradas actualmente.
              </div>
            ) : (
              <div className="space-y-2">
                {studentEnrollments.map((enr) => {
                  const isSelected = enr.id === selectedEnrollmentId;
                  const cTitle = courseForEnrollment(enr);
                  return (
                    <button
                      key={enr.id}
                      type="button"
                      onClick={() => setSelectedEnrollmentId(enr.id)}
                      className={`flex w-full items-center justify-between rounded-xl border p-3 text-left transition-all ${
                        isSelected
                          ? "border-brand-500 bg-brand-50/70 shadow-sm ring-1 ring-brand-500"
                          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      <div>
                        <div className="text-xs font-semibold text-slate-900">{cTitle}</div>
                        <div className="font-mono text-2xs text-slate-500">
                          Matrícula: {enr.enrollment_code} · Estado: {enr.status}
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge
                          color={
                            enr.payment_status === "paid"
                              ? "green"
                              : enr.payment_status === "overdue"
                                ? "red"
                                : "amber"
                          }
                        >
                          {enr.payment_status === "paid"
                            ? "Al día"
                            : enr.payment_status === "overdue"
                              ? "En mora"
                              : "Pendiente"}
                        </Badge>
                        <div className="mt-1 font-mono text-xs font-bold text-slate-900 tabular">
                          Saldo: {money(enr.balance)}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Step 3: Payment details */}
        {activeEnrollment && (
          <div className="space-y-3.5 border-t border-slate-200 pt-3.5">
            {ledger && (
              <div className="flex items-center justify-between rounded-xl bg-slate-100/70 px-3.5 py-2 text-xs">
                <div>
                  <span className="text-slate-500">Saldo pendiente: </span>
                  <strong
                    className={`font-mono text-sm ${
                      ledger.balance > 0 ? "text-red-700" : "text-emerald-700"
                    }`}
                  >
                    {money(ledger.balance)}
                  </strong>
                </div>
                {ledger.balance > 0 && (
                  <Button variant="secondary" size="sm" onClick={handleFillBalance}>
                    Cobrar saldo total ({money(ledger.balance)})
                  </Button>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Field label={`Monto a recibir (${symbol})`} required>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  autoFocus
                />
              </Field>

              <Field label="Forma de pago" required>
                <Select value={method} onChange={(e) => setMethod(e.target.value)}>
                  <option value="cash">Efectivo</option>
                  <option value="transfer">Transferencia bancaria</option>
                  <option value="card">Tarjeta de crédito / débito</option>
                </Select>
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="No. de Boleta / Referencia (opcional)">
                <Input
                  placeholder="Ej. B-98421"
                  value={receiptNumber}
                  onChange={(e) => setReceiptNumber(e.target.value)}
                />
              </Field>

              <Field label="Notas / Observaciones (opcional)">
                <Input
                  placeholder="Ej. Pago de 2da cuota"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </Field>
            </div>

            <label className="flex items-center gap-2 pt-1 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={showReceiptAfter}
                onChange={(e) => setShowReceiptAfter(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              <span>Generar comprobante / recibo de caja imprimible inmediatamente</span>
            </label>
          </div>
        )}
      </div>
    </Modal>
  );
}
