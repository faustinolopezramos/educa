import { useState } from "react";

import {
  Badge, Button, Card, Field, Input, Modal, Select, Table, Td, Th,
} from "../../components/ui";
import { EnrollWizard } from "../enrollments/EnrollWizard";
import {
  useCourses,
  useCreatePayment,
  useEnrollmentCertificate,
  useEnrollmentInvoices,
  useEnrollmentLedger,
  useEnrollments,
  useFinalGrade,
  useIssueCertificate,
  useIssueInvoice,
  useUpdateEnrollment,
  useUsers,
  downloadInvoicePdf,
} from "../../lib/queries";
import { notify } from "../../lib/toast";
import { apiErrorMessage } from "../../lib/api";
import { ENROLLMENT_LABELS } from "../../lib/format";
import type { Enrollment, EnrollmentStatus } from "../../lib/types";
import { onMutationError } from "./shared";

const STATUS_LABELS = ENROLLMENT_LABELS as Record<EnrollmentStatus, string>;
const STATUS_COLORS: Record<EnrollmentStatus, "green" | "slate" | "amber" | "indigo" | "red"> = {
  enrolled: "slate",
  active: "green",
  inactive: "amber",
  certified: "indigo",
  withdrawn: "red",
};

export function EnrollmentsPanel() {
  const { data: enrollments = [] } = useEnrollments();
  const { data: courses = [] } = useCourses();
  const { data: students = [] } = useUsers("student");
  const [wizardOpen, setWizardOpen] = useState(false);
  const [finances, setFinances] = useState<Enrollment | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setWizardOpen(true)}>+ Matricular alumno</Button>
      </div>
      {wizardOpen && <EnrollWizard onClose={() => setWizardOpen(false)} />}
      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Código</Th>
              <Th>Alumno</Th>
              <Th>Curso</Th>
              <Th>Estado</Th>
              <Th>Pago</Th>
              <Th>Cuota</Th>
              <Th>Asiste</Th>
              <Th>Certificado</Th>
              <Th>Finanzas</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {enrollments.map((e) => (
              <tr key={e.id}>
                <Td>
                  <span className="font-mono text-xs text-slate-500">{e.enrollment_code}</span>
                </Td>
                <Td>
                  {students.find((s) => s.id === e.student_id)?.full_name ??
                    e.student_id}
                </Td>
                <Td>{courses.find((c) => c.id === e.course_id)?.name ?? e.course_id}</Td>
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
                    {e.payment_status}
                  </Badge>
                </Td>
                <Td>Q{e.amount.toFixed(2)}</Td>
                <Td>
                  <AttendanceToggle enrollment={e} />
                </Td>
                <Td>
                  <CertificateCell enrollmentId={e.id} />
                </Td>
                <Td>
                  <Button
                    variant="secondary"
                    className="px-2 py-1 text-xs"
                    onClick={() => setFinances(e)}
                  >
                    Ver
                  </Button>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      {finances && (
        <FinancesModal enrollment={finances} onClose={() => setFinances(null)} />
      )}
    </div>
  );
}

function StatusSelect({ enrollment }: { enrollment: Enrollment }) {
  const update = useUpdateEnrollment();
  return (
    <div className="flex items-center gap-1.5">
      <Badge color={STATUS_COLORS[enrollment.status]}>
        {STATUS_LABELS[enrollment.status]}
      </Badge>
      <Select
        className="min-w-[8rem]"
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
    </div>
  );
}

function AttendanceToggle({ enrollment }: { enrollment: Enrollment }) {
  const update = useUpdateEnrollment();
  const blocked = enrollment.attendance_blocked;
  return (
    <button
      type="button"
      disabled={enrollment.status !== "active" || update.isPending}
      onClick={() =>
        update.mutate(
          { id: enrollment.id, attendance_blocked: !blocked },
          {
            onSuccess: () =>
              notify(
                blocked ? "Puede asistir a clases" : "Bloqueado para clases",
                "success",
              ),
            onError: onMutationError("No se pudo actualizar"),
          },
        )
      }
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition ${
        enrollment.status !== "active"
          ? "cursor-not-allowed opacity-40"
          : blocked
            ? "bg-red-100 text-red-700 hover:bg-red-200"
            : "bg-green-100 text-green-700 hover:bg-green-200"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${blocked ? "bg-red-600" : "bg-green-600"}`} />
      {blocked ? "Bloqueado" : "Permitido"}
    </button>
  );
}

function CertificateCell({ enrollmentId }: { enrollmentId: number }) {
  const { data: final } = useFinalGrade(enrollmentId);
  const { data: certificate } = useEnrollmentCertificate(enrollmentId);
  const issue = useIssueCertificate();

  if (certificate) {
    return <span className="text-xs text-green-700">Emitido · {certificate.code}</span>;
  }
  if (!final || !final.passed) {
    return <span className="text-xs text-slate-400">—</span>;
  }
  return (
    <Button
      variant="secondary"
      className="px-2 py-1 text-xs"
      disabled={issue.isPending}
      onClick={() =>
        issue.mutate(enrollmentId, {
          onSuccess: () => notify("Certificado emitido", "success"),
          onError: onMutationError("No se pudo emitir"),
        })
      }
    >
      Emitir
    </Button>
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
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("efectivo");

  function registerPayment(kind: "charge" | "payment") {
    const value = Number(amount);
    if (!value || value <= 0) {
      notify("Ingresa un monto válido", "error");
      return;
    }
    createPayment.mutate(
      { enrollment_id: enrollment.id, kind, amount: value, method },
      {
        onSuccess: () => {
          setAmount("");
          notify(kind === "charge" ? "Cargo registrado" : "Pago registrado", "success");
        },
        onError: onMutationError("No se pudo registrar el movimiento"),
      },
    );
  }

  return (
    <Modal title={`Finanzas — ${enrollment.enrollment_code}`} onClose={onClose}>
      <div className="space-y-4">
        {ledger && (
          <div className="grid grid-cols-3 gap-2 text-center text-sm">
            <div className="rounded-lg bg-slate-50 p-2">
              <div className="text-xs text-slate-500">Cargado</div>
              <div className="font-semibold">Q{ledger.charged.toFixed(2)}</div>
            </div>
            <div className="rounded-lg bg-slate-50 p-2">
              <div className="text-xs text-slate-500">Pagado</div>
              <div className="font-semibold text-green-700">Q{ledger.paid.toFixed(2)}</div>
            </div>
            <div className="rounded-lg bg-slate-50 p-2">
              <div className="text-xs text-slate-500">Saldo</div>
              <div className={`font-semibold ${ledger.balance > 0 ? "text-red-700" : "text-green-700"}`}>
                Q{ledger.balance.toFixed(2)}
              </div>
            </div>
          </div>
        )}

        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Field label="Monto">
              <Input
                type="number"
                min={0}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </Field>
          </div>
          <Field label="Método">
            <Select value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="efectivo">Efectivo</option>
              <option value="tarjeta">Tarjeta</option>
              <option value="transferencia">Transferencia</option>
              <option value="otro">Otro</option>
            </Select>
          </Field>
          <Button
            variant="secondary"
            disabled={createPayment.isPending}
            onClick={() => registerPayment("charge")}
          >
            + Cobro
          </Button>
          <Button disabled={createPayment.isPending} onClick={() => registerPayment("payment")}>
            + Pago
          </Button>
        </div>

        <div>
          <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Movimientos
          </h4>
          <ul className="max-h-40 space-y-1 overflow-y-auto text-sm">
            {(ledger?.movements ?? []).map((m) => (
              <li key={m.id} className="flex justify-between rounded bg-slate-50 px-3 py-1.5">
                <span>{m.kind === "charge" ? "Cobro" : "Pago"} · {m.method ?? "—"}</span>
                <span className="font-mono">Q{m.amount.toFixed(2)}</span>
              </li>
            ))}
            {!ledger?.movements.length && (
              <li className="text-xs text-slate-400">Sin movimientos aún</li>
            )}
          </ul>
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 pt-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Facturas
          </h4>
          <Button
            variant="secondary"
            className="px-2 py-1 text-xs"
            disabled={issueInvoice.isPending}
            onClick={() =>
              issueInvoice.mutate(enrollment.id, {
                onSuccess: () => notify("Factura emitida", "success"),
                onError: (err) =>
                  notify(apiErrorMessage(err, "No se pudo emitir la factura"), "error"),
              })
            }
          >
            Emitir factura
          </Button>
        </div>
        <ul className="space-y-1 text-sm">
          {invoices.map((inv) => (
            <li key={inv.id} className="flex items-center justify-between rounded bg-slate-50 px-3 py-1.5">
              <span>{inv.code} · Q{inv.total_amount.toFixed(2)}</span>
              <Button
                variant="ghost"
                className="px-2 py-1 text-xs"
                onClick={() => downloadInvoicePdf(inv.id, inv.code)}
              >
                Descargar
              </Button>
            </li>
          ))}
          {invoices.length === 0 && (
            <li className="text-xs text-slate-400">Sin facturas emitidas</li>
          )}
        </ul>
      </div>
    </Modal>
  );
}
