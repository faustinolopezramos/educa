import { Button, Modal, ModalActions } from "../../components/ui";
import { formatDateTime } from "../../lib/format";
import { useAuth } from "../../auth/AuthContext";
import { useMoney } from "../../lib/useMoney";

export interface ReceiptData {
  receiptNumber?: string | number | null;
  studentName: string;
  studentEmail?: string | null;
  studentPhone?: string | null;
  studentCui?: string | null;
  courseName?: string | null;
  enrollmentCode?: string | null;
  amount: number;
  method?: string | null;
  notes?: string | null;
  date?: string;
  previousBalance?: number | null;
  remainingBalance?: number | null;
}

export function PaymentReceiptModal({
  receipt,
  onClose,
}: {
  receipt: ReceiptData;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const { money } = useMoney();

  const formattedDate = receipt.date
    ? formatDateTime(receipt.date)
    : formatDateTime(new Date().toISOString());

  const methodLabel: Record<string, string> = {
    cash: "Efectivo",
    transfer: "Transferencia bancaria",
    card: "Tarjeta de crédito / débito",
  };

  const receiptFolio =
    receipt.receiptNumber != null
      ? `REC-${String(receipt.receiptNumber).padStart(5, "0")}`
      : `REC-${Date.now().toString().slice(-6)}`;

  function handlePrint() {
    window.print();
  }

  return (
    <Modal
      title="Comprobante de Caja / Recibo de Pago"
      description={`Folio: ${receiptFolio} · ${receipt.studentName}`}
      onClose={onClose}
      maxWidth="max-w-xl"
      footer={
        <ModalActions>
          <Button variant="secondary" onClick={onClose}>
            Cerrar
          </Button>
          <Button onClick={handlePrint} className="gap-2">
            🖨️ Imprimir Recibo
          </Button>
        </ModalActions>
      }
    >
      <div>
        <style>{`
          @media print {
            body * {
              visibility: hidden;
            }
            #printable-receipt-card, #printable-receipt-card * {
              visibility: visible;
            }
            #printable-receipt-card {
              position: fixed;
              left: 0;
              top: 0;
              width: 100%;
              margin: 0;
              padding: 24px;
              background: white;
              box-shadow: none !important;
              border: 1px solid #cbd5e1 !important;
              z-index: 99999;
            }
          }
        `}</style>

        <div
          id="printable-receipt-card"
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm text-slate-800"
        >
          {/* Header of Receipt */}
          <div className="flex items-start justify-between border-b border-slate-200 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-600 text-xs font-bold text-white">
                  E
                </span>
                <span className="text-base font-bold tracking-tight text-slate-900">
                  EDUCA · Academia
                </span>
              </div>
              <p className="mt-1 text-2xs text-slate-500">
                Atención y Administración Académica
              </p>
            </div>
            <div className="text-right">
              <span className="inline-block rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-800 border border-emerald-200">
                RECIBO DE CAJA
              </span>
              <div className="mt-1 font-mono text-xs font-bold text-slate-900">
                {receiptFolio}
              </div>
              <div className="text-2xs text-slate-500">{formattedDate}</div>
            </div>
          </div>

          {/* Student Info */}
          <div className="grid grid-cols-2 gap-4 border-b border-slate-100 py-3.5 text-xs">
            <div>
              <span className="text-2xs font-semibold uppercase tracking-wider text-slate-500">
                Alumno
              </span>
              <div className="font-semibold text-slate-900">{receipt.studentName}</div>
              {receipt.studentCui && (
                <div className="font-mono text-2xs text-slate-500">
                  DPI / CUI: {receipt.studentCui}
                </div>
              )}
              {receipt.studentEmail && (
                <div className="text-2xs text-slate-500">{receipt.studentEmail}</div>
              )}
            </div>
            <div>
              <span className="text-2xs font-semibold uppercase tracking-wider text-slate-500">
                Curso / Matrícula
              </span>
              <div className="font-semibold text-slate-900">
                {receipt.courseName ?? "Matrícula General"}
              </div>
              {receipt.enrollmentCode && (
                <div className="font-mono text-2xs text-slate-500">
                  Código: {receipt.enrollmentCode}
                </div>
              )}
            </div>
          </div>

          {/* Payment breakdown */}
          <div className="py-4">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-left text-2xs font-semibold uppercase tracking-wider text-slate-500">
                  <th className="pb-2">Concepto</th>
                  <th className="pb-2">Método</th>
                  <th className="pb-2 text-right">Monto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr>
                  <td className="py-2.5 font-medium text-slate-900">
                    Abono a Colegiatura / Cuota
                    {receipt.notes && (
                      <span className="block text-2xs font-normal text-slate-500">
                        Obs: {receipt.notes}
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 text-slate-600">
                    {methodLabel[receipt.method ?? ""] ?? receipt.method ?? "Efectivo"}
                  </td>
                  <td className="py-2.5 text-right font-bold text-slate-900 tabular">
                    {money(receipt.amount)}
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Total Highlight */}
            <div className="mt-3 flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 border border-slate-100">
              <span className="text-xs font-semibold text-slate-700">Total Recibido</span>
              <span className="text-lg font-extrabold text-emerald-700 tabular">
                {money(receipt.amount)}
              </span>
            </div>

            {/* Balance info */}
            {receipt.remainingBalance !== undefined && receipt.remainingBalance !== null && (
              <div className="mt-2.5 flex items-center justify-between px-2 text-2xs text-slate-500">
                <span>Saldo pendiente posterior:</span>
                <span
                  className={`font-semibold tabular ${
                    receipt.remainingBalance > 0 ? "text-amber-700" : "text-emerald-700"
                  }`}
                >
                  {receipt.remainingBalance > 0
                    ? money(receipt.remainingBalance)
                    : "Completamente al día"}
                </span>
              </div>
            )}
          </div>

          {/* Signatures */}
          <div className="mt-6 pt-4 border-t border-slate-200">
            <div className="grid grid-cols-2 gap-8 text-center text-2xs text-slate-500">
              <div>
                <div className="mx-auto mb-1 h-8 w-32 border-b border-slate-300"></div>
                <span>Recibido en Caja: {user?.full_name ?? "Secretaría"}</span>
              </div>
              <div>
                <div className="mx-auto mb-1 h-8 w-32 border-b border-slate-300"></div>
                <span>Firma Alumno / Tutor</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
