import { useState } from "react";
import { Badge, Button, Modal, ModalActions } from "../../components/ui";
import {
  useBookMakeUp,
  useCancelMakeUpBooking,
  useCandidateSessions,
} from "../../lib/queries";
import { notify } from "../../lib/toast";
import { apiErrorMessage } from "../../lib/api";
import { formatTime, modalityColor, modalityLabel } from "../../lib/format";
import type { CandidateSession, MakeUpCredit } from "../../lib/types";

interface Props {
  credit: MakeUpCredit;
  onClose: () => void;
  onSuccess?: () => void;
}

export function MakeUpBookingModal({ credit, onClose, onSuccess }: Props) {
  const { data: candidates = [], isLoading } = useCandidateSessions(credit.id);
  const book = useBookMakeUp();
  const cancel = useCancelMakeUpBooking();
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);

  const isBooked = credit.status === "booked";

  const handleBook = (session: CandidateSession) => {
    setSelectedSessionId(session.session_id);
    book.mutate(
      { creditId: credit.id, targetSessionId: session.session_id },
      {
        onSuccess: () => {
          notify("¡Clase de recuperación agendada con éxito!", "success");
          onSuccess?.();
          onClose();
        },
        onError: (err) => {
          notify(apiErrorMessage(err, "No se pudo agendar la clase"), "error");
        },
      },
    );
  };

  const handleCancelBooking = () => {
    cancel.mutate(credit.id, {
      onSuccess: () => {
        notify("Reserva de recuperación cancelada. El pase queda disponible.", "success");
        onSuccess?.();
        onClose();
      },
      onError: (err) => {
        notify(apiErrorMessage(err, "No se pudo cancelar la reserva"), "error");
      },
    });
  };

  return (
    <Modal title="Agendar Clase de Recuperación" onClose={onClose}>
      <div className="space-y-4">
        {/* Info card of credit */}
        <div className="rounded-xl border border-brand-100 bg-brand-50/50 p-4 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="font-semibold text-brand-900 text-sm">
                Pase de Recuperación #{credit.id}
              </span>
              <p className="text-slate-600 mt-0.5">
                Nivel MCER: <span className="font-bold text-slate-800">{credit.level_name ?? "General"}</span>
                {credit.course_name && ` · Curso: ${credit.course_name}`}
              </p>
            </div>
            <div className="text-right">
              <span className="text-slate-500">Válido hasta:</span>
              <p className="font-medium text-slate-700">{credit.expires_at}</p>
            </div>
          </div>
          {credit.notes && (
            <p className="mt-2 text-slate-500 italic border-t border-brand-100/70 pt-1.5">
              Nota: {credit.notes}
            </p>
          )}
        </div>

        {isBooked && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-emerald-900 text-sm">
                  Tienes una reserva activa
                </p>
                <p className="text-xs text-emerald-700 mt-1">
                  Fecha: {credit.target_session_date} {credit.target_session_time && `· Horario: ${credit.target_session_time}`}
                </p>
                {credit.target_course_name && (
                  <p className="text-xs text-emerald-600 font-medium mt-0.5">
                    Grupo: {credit.target_course_name}
                  </p>
                )}
              </div>
              <Button
                variant="secondary"
                size="sm"
                className="border-red-200 text-red-700 hover:bg-red-50 text-xs"
                disabled={cancel.isPending}
                onClick={handleCancelBooking}
              >
                {cancel.isPending ? "Cancelando…" : "Liberar plaza"}
              </Button>
            </div>
          </div>
        )}

        <div>
          <h4 className="text-sm font-semibold text-slate-800 mb-2">
            Sesiones paralelas disponibles (Mismo Nivel MCER)
          </h4>
          <p className="text-2xs text-slate-500 mb-3">
            Sólo se muestran clases del mismo nivel que cuentan con cupo y aforo libre.
          </p>

          {isLoading ? (
            <p className="text-xs text-slate-500 py-6 text-center">Buscando grupos con aforo disponible…</p>
          ) : candidates.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center">
              <p className="text-xs text-slate-500">
                No hay sesiones paralelas disponibles con aforo libre para este nivel en este momento.
              </p>
              <p className="text-2xs text-slate-400 mt-1">
                Consulta con la secretaría académica si requieres habilitar un cupo especial.
              </p>
            </div>
          ) : (
            <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
              {candidates.map((cand) => (
                <div
                  key={cand.session_id}
                  className="rounded-xl border border-slate-200 bg-white p-3 hover:border-brand-300 transition-colors flex items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-xs text-slate-900">
                        {cand.date} · {formatTime(cand.start_time)}–{formatTime(cand.end_time)}
                      </span>
                      <Badge color={modalityColor(cand.modality)}>
                        {modalityLabel(cand.modality)}
                      </Badge>
                    </div>
                    <p className="text-2xs text-slate-600 truncate mt-0.5">
                      {cand.course_name} · Docente: {cand.teacher_name}
                    </p>
                    <div className="flex items-center gap-2 mt-1 text-3xs text-slate-500">
                      <span>Plazas libres: <strong className="text-emerald-600">{cand.available_seats}</strong> de {cand.max_students}</span>
                      {cand.room_name && <span>· Aula: {cand.room_name}</span>}
                    </div>
                  </div>

                  <Button
                    size="sm"
                    className="flex-none text-xs bg-brand-600 hover:bg-brand-700 text-white"
                    disabled={book.isPending && selectedSessionId === cand.session_id}
                    onClick={() => handleBook(cand)}
                  >
                    {book.isPending && selectedSessionId === cand.session_id
                      ? "Agendando…"
                      : "Reservar →"}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <ModalActions>
        <Button variant="secondary" onClick={onClose}>
          Cerrar
        </Button>
      </ModalActions>
    </Modal>
  );
}
