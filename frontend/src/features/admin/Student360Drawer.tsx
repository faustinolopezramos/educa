import { useEffect, useState } from "react";
import { Badge, Button, Card, Field, Input, Modal, ModalActions, Select, Table, Td, Th } from "../../components/ui";
import { api, apiErrorMessage } from "../../lib/api";
import { formatDateTime } from "../../lib/format";
import {
  useCourses,
  useCreatePayment,
  useEnrollmentLedger,
  useEnrollments,
} from "../../lib/queries";
import { notify } from "../../lib/toast";
import type { PaymentKind, User } from "../../lib/types";

interface KardexSummary {
  global_gpa: number;
  overall_attendance_rate: number;
  total_courses_passed: number;
  total_courses_failed: number;
  total_certificates_earned: number;
  person_status: string;
  person_status_label: string;
  outstanding_balance: number;
}

interface KardexCourseEntry {
  enrollment_id: number;
  course_id: number;
  course_title: string;
  level_name: string;
  status: string;
  status_label: string;
  enrollment_code: string;
  final_score: number | null;
  passed: boolean | null;
  certificate_code: string | null;
  balance: number;
}

interface StudentKardexResponse {
  student_id: number;
  student_name: string;
  student_email: string;
  phone: string | null;
  nationality: string | null;
  summary: KardexSummary;
  history: KardexCourseEntry[];
}

export function Student360Drawer({
  student,
  onClose,
  onMatricular,
}: {
  student: User;
  onClose: () => void;
  onMatricular?: (studentId: number) => void;
}) {
  const [activeTab, setActiveTab] = useState<"kardex" | "finances">("kardex");
  const [kardexData, setKardexData] = useState<StudentKardexResponse | null>(null);

  // Enrollments & Finances query
  const { data: enrollments = [] } = useEnrollments();
  const { data: courses = [] } = useCourses();
  const studentEnrollments = enrollments.filter((e) => e.student_id === student.id);

  const [selectedEnrollmentId, setSelectedEnrollmentId] = useState<number | null>(
    studentEnrollments.length > 0 ? studentEnrollments[0].id : null,
  );
  const activeEnrollment = studentEnrollments.find((e) => e.id === selectedEnrollmentId);
  const { data: ledger } = useEnrollmentLedger(activeEnrollment?.id);
  const createPayment = useCreatePayment();

  // Payment form state
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentKind, setPaymentKind] = useState<PaymentKind>("payment");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("transfer");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    api
      .get<StudentKardexResponse>(`/users/${student.id}/kardex`)
      .then((res) => setKardexData(res.data))
      .catch(() => {
        // Fallback silently if Kardex service has no records yet
      });
  }, [student.id]);

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
        notes: notes.trim() || undefined,
      },
      {
        onSuccess: () => {
          setAmount("");
          setNotes("");
          setShowPaymentForm(false);
          notify("Movimiento financiero registrado correctamente", "success");
        },
        onError: (e) => notify(apiErrorMessage(e, "Error al registrar pago"), "error"),
      },
    );
  }

  const summary = kardexData?.summary;
  const history = kardexData?.history ?? [];

  return (
    <Modal
      title={`Expediente Alumno 360° · ${student.full_name}`}
      description={
        student.cui_passport
          ? `Identificación: ${student.cui_passport} • ${student.email}`
          : student.email
      }
      onClose={onClose}
      maxWidth="max-w-4xl"
      footer={
        <ModalActions>
          <Button
            variant="secondary"
            onClick={() => {
              window.print();
            }}
          >
            Imprimir Ficha 360°
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Cerrar
          </Button>
          {onMatricular && (
            <Button
              onClick={() => {
                onClose();
                onMatricular(student.id);
              }}
            >
              + Matricular en Curso
            </Button>
          )}
        </ModalActions>
      }
    >
      <div className="space-y-5">
        {/* Tab Header Navigation */}
        <div className="flex border-b border-slate-200">
          <button
            type="button"
            onClick={() => setActiveTab("kardex")}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition ${
              activeTab === "kardex"
                ? "border-brand-600 text-brand-600"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            Expediente Académico
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("finances")}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition ${
              activeTab === "finances"
                ? "border-brand-600 text-brand-600"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            Estado Financiero & Pagos
          </button>
        </div>

        {/* TAB 1: EXPEDIENTE ACADÉMICO */}
        {activeTab === "kardex" && (
          <div className="space-y-5">
            {/* KPI Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Card padding="sm">
                <div className="text-2xs text-slate-500 font-medium">Promedio GPA</div>
                <div className="text-lg font-bold text-slate-900 mt-0.5">
                  {summary ? `${summary.global_gpa} / 100` : "—"}
                </div>
              </Card>
              <Card padding="sm">
                <div className="text-2xs text-slate-500 font-medium">Asistencia Global</div>
                <div className="text-lg font-bold text-emerald-600 mt-0.5">
                  {summary ? `${summary.overall_attendance_rate}%` : "—"}
                </div>
              </Card>
              <Card padding="sm">
                <div className="text-2xs text-slate-500 font-medium">Cursos Aprobados</div>
                <div className="text-lg font-bold text-slate-900 mt-0.5">
                  {summary ? summary.total_courses_passed : 0}
                </div>
              </Card>
              <Card padding="sm">
                <div className="text-2xs text-slate-500 font-medium">Saldo Pendiente</div>
                <div
                  className={`text-lg font-bold mt-0.5 ${
                    (summary?.outstanding_balance ?? 0) > 0 ? "text-red-600" : "text-slate-900"
                  }`}
                >
                  Q{(summary?.outstanding_balance ?? 0).toFixed(2)}
                </div>
              </Card>
            </div>

            {/* Course History Table */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Historial de Cursos e Inscripciones
              </h4>
              {history.length === 0 ? (
                <p className="text-xs italic text-slate-400 p-3 bg-slate-50 rounded-lg border border-slate-200">
                  El alumno no registra cursos previos.
                </p>
              ) : (
                <Card padding="none" className="overflow-hidden">
                  <Table>
                    <thead>
                      <tr>
                        <Th>Curso & Nivel</Th>
                        <Th>Código</Th>
                        <Th>Nota Final</Th>
                        <Th>Estado</Th>
                        <Th align="right">Saldo</Th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {history.map((item) => (
                        <tr key={item.enrollment_id} className="hover:bg-slate-50">
                          <Td>
                            <div className="font-medium text-slate-900">{item.course_title}</div>
                            <div className="text-2xs text-slate-500">{item.level_name}</div>
                          </Td>
                          <Td>
                            <span className="font-mono text-2xs text-slate-600">
                              {item.enrollment_code}
                            </span>
                          </Td>
                          <Td>
                            {item.final_score !== null ? (
                              <span
                                className={`font-bold ${
                                  item.passed ? "text-emerald-600" : "text-red-600"
                                }`}
                              >
                                {item.final_score} pts
                              </span>
                            ) : (
                              <span className="text-xs text-slate-400">En curso</span>
                            )}
                          </Td>
                          <Td>
                            <Badge color={item.passed ? "green" : item.passed === false ? "red" : "amber"}>
                              {item.status_label}
                            </Badge>
                          </Td>
                          <Td align="right">
                            <span
                              className={`tabular font-mono text-xs ${
                                item.balance > 0 ? "font-semibold text-red-600" : "text-slate-500"
                              }`}
                            >
                              Q{item.balance.toFixed(2)}
                            </span>
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </Card>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: ESTADO FINANCIERO & PAGOS */}
        {activeTab === "finances" && (
          <div className="space-y-4">
            {studentEnrollments.length === 0 ? (
              <p className="text-xs text-slate-500 bg-slate-50 p-4 rounded-xl border border-slate-200">
                El alumno no tiene inscripciones registradas para verificar finanzas.
              </p>
            ) : (
              <>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-600">Matrícula:</span>
                    <Select
                      value={selectedEnrollmentId ?? 0}
                      onChange={(e) => setSelectedEnrollmentId(Number(e.target.value))}
                      className="w-auto text-xs"
                    >
                      {studentEnrollments.map((e) => {
                        const courseName = courses.find((c) => c.id === e.course_id)?.name ?? `#${e.course_id}`;
                        return (
                          <option key={e.id} value={e.id}>
                            {e.enrollment_code} — {courseName}
                          </option>
                        );
                      })}
                    </Select>
                  </div>
                  <Button size="sm" onClick={() => setShowPaymentForm((v) => !v)}>
                    {showPaymentForm ? "Cancelar pago" : "+ Registrar Pago"}
                  </Button>
                </div>

                {/* Ledger Summary */}
                {ledger && (
                  <div className="grid grid-cols-3 divide-x divide-slate-200 rounded-xl border border-slate-200 bg-slate-50">
                    <div className="px-3.5 py-2.5">
                      <div className="text-2xs text-slate-500 font-medium">Total Cobrado</div>
                      <div className="tabular text-base font-bold text-slate-900">
                        Q{ledger.charged.toFixed(2)}
                      </div>
                    </div>
                    <div className="px-3.5 py-2.5">
                      <div className="text-2xs text-slate-500 font-medium">Total Pagado</div>
                      <div className="tabular text-base font-bold text-emerald-700">
                        Q{ledger.paid.toFixed(2)}
                      </div>
                    </div>
                    <div className="px-3.5 py-2.5">
                      <div className="text-2xs text-slate-500 font-medium">Saldo Actual</div>
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

                {/* Inline Payment Registration Form */}
                {showPaymentForm && (
                  <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                    <h5 className="text-xs font-bold text-slate-900">Registrar Movimiento Financiero</h5>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <Field label="Tipo de Movimiento" required={true}>
                        <Select
                          value={paymentKind}
                          onChange={(e) => setPaymentKind(e.target.value as PaymentKind)}
                        >
                          <option value="payment">Pago Recibido</option>
                          <option value="charge">Cobro / Cuota Nueva</option>
                        </Select>
                      </Field>

                      <Field label="Monto (Q)" required={true}>
                        <Input
                          type="number"
                          placeholder="0.00"
                          value={amount}
                          onChange={(e) => setAmount(e.target.value)}
                        />
                      </Field>

                      {paymentKind === "payment" && (
                        <Field label="Método de Pago">
                          <Select value={method} onChange={(e) => setMethod(e.target.value)}>
                            <option value="transfer">Transferencia Bancaria</option>
                            <option value="cash">Efectivo</option>
                            <option value="card">Tarjeta de Crédito/Débito</option>
                          </Select>
                        </Field>
                      )}
                    </div>

                    <Button size="sm" onClick={handleRegisterPayment} disabled={createPayment.isPending}>
                      {createPayment.isPending ? "Guardando…" : "Confirmar Movimiento"}
                    </Button>
                  </div>
                )}

                {/* Transaction History */}
                {ledger?.movements && ledger.movements.length > 0 && (
                  <Card padding="none" className="overflow-hidden">
                    <Table>
                      <thead>
                        <tr>
                          <Th>Fecha</Th>
                          <Th>Tipo</Th>
                          <Th>Método</Th>
                          <Th align="right">Monto</Th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {ledger.movements.map((tx) => (
                          <tr key={tx.id} className="hover:bg-slate-50">
                            <Td>
                              <span className="text-2xs text-slate-600">
                                {formatDateTime(tx.paid_at)}
                              </span>
                            </Td>
                            <Td>
                              <Badge color={tx.kind === "payment" ? "green" : "amber"}>
                                {tx.kind === "payment" ? "Pago" : "Cobro"}
                              </Badge>
                            </Td>
                            <Td>
                              <span className="text-xs text-slate-600 capitalize">
                                {tx.method ?? "—"}
                              </span>
                            </Td>
                            <Td align="right">
                              <span
                                className={`font-mono text-xs font-bold ${
                                  tx.kind === "payment" ? "text-emerald-700" : "text-slate-900"
                                }`}
                              >
                                {tx.kind === "payment" ? "-" : "+"}Q{tx.amount.toFixed(2)}
                              </span>
                            </Td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </Card>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
