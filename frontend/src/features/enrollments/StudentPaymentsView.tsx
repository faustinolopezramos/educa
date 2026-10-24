import { useState } from "react";
import { Badge, Button, Card, EmptyState, SectionHeading, SkeletonRows } from "../../components/ui";
import { IconCash } from "../../components/icons";
import {
  downloadInvoicePdf,
  useCourses,
  useEnrollmentInvoices,
  useEnrollmentLedger,
  useEnrollments,
} from "../../lib/queries";
import { useMoney } from "../../lib/useMoney";
import { formatDateTime } from "../../lib/format";
import { notify } from "../../lib/toast";
import type { Enrollment } from "../../lib/types";

export function StudentPaymentsView() {
  const { data: enrollments = [], isLoading } = useEnrollments();
  const { data: courses = [] } = useCourses();
  const [selectedEnrollmentId, setSelectedEnrollmentId] = useState<number | null>(null);

  if (isLoading) return <SkeletonRows rows={4} />;

  if (enrollments.length === 0) {
    return (
      <EmptyState
        icon={<IconCash className="h-6 w-6" />}
        title="Sin registros de matrícula"
        message="Cuando te matricules en un curso, podrás consultar tus pagos y estados de cuenta aquí."
      />
    );
  }

  const activeId = selectedEnrollmentId ?? enrollments[0]?.id;
  const currentEnrollment = enrollments.find((e) => e.id === activeId) ?? enrollments[0];
  const courseName = (id: number) => courses.find((c) => c.id === id)?.name ?? `Curso #${id}`;

  return (
    <div className="space-y-6">
      {/* Course Enrollment Selector */}
      {enrollments.length > 1 && (
        <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
          {enrollments.map((e) => {
            const isSelected = e.id === activeId;
            return (
              <button
                key={e.id}
                type="button"
                onClick={() => setSelectedEnrollmentId(e.id)}
                className={`rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
                  isSelected
                    ? "bg-brand-700 text-white shadow-xs"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {courseName(e.course_id)} ({e.enrollment_code})
              </button>
            );
          })}
        </div>
      )}

      {currentEnrollment && (
        <EnrollmentFinanceDetail enrollment={currentEnrollment} courseTitle={courseName(currentEnrollment.course_id)} />
      )}
    </div>
  );
}

function EnrollmentFinanceDetail({
  enrollment,
  courseTitle,
}: {
  enrollment: Enrollment;
  courseTitle: string;
}) {
  const { money } = useMoney();
  const { data: ledger, isLoading: ledgerLoading } = useEnrollmentLedger(enrollment.id);
  const { data: invoices = [], isLoading: invoicesLoading } = useEnrollmentInvoices(enrollment.id);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);

  const isSolvent = enrollment.balance <= 0 && enrollment.payment_status === "paid";
  const hasDebt = enrollment.balance > 0 || enrollment.payment_status === "overdue";

  async function handleDownloadInvoice(id: number, code: string) {
    try {
      setDownloadingId(id);
      await downloadInvoicePdf(id, code);
      notify("Factura descargada", "success");
    } catch {
      notify("No se pudo descargar la factura en este momento", "error");
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Overview Banner */}
      <Card className="border-slate-200 bg-white p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="font-mono text-xs font-bold text-brand-700">
                {enrollment.enrollment_code}
              </span>
              <span className="text-slate-300">·</span>
              <h3 className="text-lg font-bold text-slate-900">{courseTitle}</h3>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Estado de cuenta estudiantil y comprobantes oficiales de pago.
            </p>
          </div>

          <div>
            {isSolvent ? (
              <Badge color="green">✓ Solvente / Pagos al día</Badge>
            ) : hasDebt ? (
              <Badge color="red">⚠️ Saldo pendiente: {money(enrollment.balance)}</Badge>
            ) : (
              <Badge color="amber">Cuota en proceso</Badge>
            )}
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3 border-t border-slate-100 pt-4 text-xs">
          <div className="rounded-xl bg-slate-50 p-3 border border-slate-100">
            <span className="text-2xs font-semibold uppercase tracking-wider text-slate-500 block">
              Total Cargos
            </span>
            <span className="mt-1 text-xl font-bold text-slate-900 block tabular">
              {ledger ? money(ledger.charged) : money(enrollment.amount)}
            </span>
          </div>

          <div className="rounded-xl bg-emerald-50/60 p-3 border border-emerald-100">
            <span className="text-2xs font-semibold uppercase tracking-wider text-emerald-700 block">
              Total Pagado
            </span>
            <span className="mt-1 text-xl font-bold text-emerald-900 block tabular">
              {ledger ? money(ledger.paid) : "—"}
            </span>
          </div>

          <div
            className={`rounded-xl p-3 border ${
              enrollment.balance > 0
                ? "bg-red-50/60 border-red-200 text-red-900"
                : "bg-slate-50 border-slate-100 text-slate-900"
            }`}
          >
            <span className="text-2xs font-semibold uppercase tracking-wider text-slate-500 block">
              Saldo Pendiente (Balance)
            </span>
            <span className="mt-1 text-xl font-bold block tabular">
              {money(enrollment.balance)}
            </span>
          </div>
        </div>
      </Card>

      {/* Movements Table */}
      <Card className="overflow-hidden border-slate-200 p-0 shadow-xs">
        <div className="border-b border-slate-100 bg-slate-50/80 px-5 py-3.5 flex items-center justify-between">
          <SectionHeading>Movimientos y Pagos Registrados</SectionHeading>
          <span className="text-xs text-slate-500">
            {ledger?.movements?.length ?? 0} movimiento(s)
          </span>
        </div>

        {ledgerLoading ? (
          <div className="p-5">
            <SkeletonRows rows={3} />
          </div>
        ) : !ledger || ledger.movements.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            No hay movimientos registrados para esta matrícula aún.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-100 bg-slate-50/50 text-2xs font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-2.5">Fecha</th>
                  <th className="px-5 py-2.5">Tipo</th>
                  <th className="px-5 py-2.5">Concepto / Notas</th>
                  <th className="px-5 py-2.5">Método / No. Recibo</th>
                  <th className="px-5 py-2.5 text-right">Monto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {ledger.movements.map((m) => {
                  const isPayment = m.kind === "payment";
                  return (
                    <tr key={m.id} className="hover:bg-slate-50/40 transition">
                      <td className="px-5 py-3 font-medium text-slate-600">
                        {m.paid_at ? formatDateTime(m.paid_at) : m.due_date ?? "—"}
                      </td>
                      <td className="px-5 py-3">
                        <Badge color={isPayment ? "green" : "slate"}>
                          {isPayment ? "Pago (Abono)" : "Cuota (Cargo)"}
                        </Badge>
                      </td>
                      <td className="px-5 py-3 text-slate-800">
                        {m.notes || (isPayment ? "Abono a colegiatura" : "Cuota regular")}
                      </td>
                      <td className="px-5 py-3 text-slate-500">
                        {m.method ? `${m.method}` : "—"}
                        {m.receipt_number && ` · Recibo #${m.receipt_number}`}
                      </td>
                      <td className={`px-5 py-3 text-right font-bold tabular ${isPayment ? "text-emerald-700" : "text-slate-900"}`}>
                        {isPayment ? `- ${money(m.amount)}` : money(m.amount)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Official Invoices / Comprobantes */}
      <Card className="overflow-hidden border-slate-200 p-0 shadow-xs">
        <div className="border-b border-slate-100 bg-slate-50/80 px-5 py-3.5 flex items-center justify-between">
          <SectionHeading>Comprobantes y Facturas Emitidas</SectionHeading>
          <span className="text-xs text-slate-500">
            {invoices.length} comprobante(s)
          </span>
        </div>

        {invoicesLoading ? (
          <div className="p-5">
            <SkeletonRows rows={2} />
          </div>
        ) : invoices.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            No se han generado facturas o recibos oficiales para esta matrícula todavía.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {invoices.map((inv) => (
              <div
                key={inv.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 hover:bg-slate-50/50 transition"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-slate-900">
                      Factura #{inv.code}
                    </span>
                    <Badge color="indigo">Oficial</Badge>
                  </div>
                  <p className="text-2xs text-slate-500 mt-0.5">
                    Emitida el {formatDateTime(inv.issued_at)} · Total:{" "}
                    <strong className="text-slate-800">{money(inv.total_amount)}</strong>
                  </p>
                </div>

                <Button
                  size="sm"
                  variant="secondary"
                  disabled={downloadingId === inv.id}
                  onClick={() => handleDownloadInvoice(inv.id, inv.code)}
                  className="flex items-center gap-1.5 self-start sm:self-auto text-xs"
                >
                  <span>📄</span>
                  <span>{downloadingId === inv.id ? "Descargando…" : "Descargar PDF"}</span>
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
