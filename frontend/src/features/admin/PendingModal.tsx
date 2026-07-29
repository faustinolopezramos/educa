import { useState } from "react";

import { Badge, Button, EmptyState, Modal, ModalActions, Table, Td, Th } from "../../components/ui";
import { PromptModal } from "../../components/PromptModal";
import { useLocationProposals, useReviewProposal, useRooms, useUsers } from "../../lib/queries";
import { notify } from "../../lib/toast";
import { onMutationError } from "./shared";

interface Props {
  onClose: () => void;
}

export function PendingModal({ onClose }: Props) {
  const { data: pending = [] } = useLocationProposals("pending");
  const { data: rooms = [] } = useRooms();
  const { data: teachers = [] } = useUsers("teacher");
  const review = useReviewProposal();
  const [rejecting, setRejecting] = useState<number | null>(null);

  const teacherName = (id: number) =>
    teachers.find((t) => t.id === id)?.full_name ?? `#${id}`;
  const roomName = (id: number | null) =>
    id == null ? "—" : (rooms.find((r) => r.id === id)?.name ?? `#${id}`);

  function approve(id: number) {
    review.mutate(
      { id, action: "approve" },
      {
        onSuccess: () => notify("Propuesta aprobada", "success"),
        onError: onMutationError("No se pudo revisar la propuesta"),
      },
    );
  }

  return (
    <>
      <Modal
        title="Pendientes de revisión"
        description="Aulas y enlaces que los profesores proponen para sus clases."
        onClose={onClose}
        maxWidth="max-w-2xl"
        footer={
          <ModalActions
            hint={
              pending.length > 0
                ? `${pending.length} ${pending.length === 1 ? "propuesta" : "propuestas"} por revisar`
                : undefined
            }
          >
            <Button variant="secondary" onClick={onClose}>
              Cerrar
            </Button>
          </ModalActions>
        }
      >
        <div className="space-y-4 text-xs">
          {pending.length === 0 ? (
            <EmptyState
              icon="✓"
              title="¡Todo al día!"
              message="No tienes propuestas de aula o enlace virtual pendientes de aprobación en este momento."
            />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <Table>
                <thead>
                  <tr>
                    <Th>Profesor</Th>
                    <Th>Modalidad</Th>
                    <Th>Detalle / Ubicación</Th>
                    <Th>Acciones</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pending.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/50 transition">
                      <Td>
                        <span className="font-semibold text-slate-900">{teacherName(p.proposed_by)}</span>
                      </Td>
                      <Td>
                        <Badge color={p.modality === "virtual" ? "indigo" : "slate"}>
                          {p.modality === "virtual" ? "💻 Virtual" : "🏫 Presencial"}
                        </Badge>
                      </Td>
                      <Td>
                        {p.modality === "virtual" ? (
                          <a
                            href={p.join_url ?? "#"}
                            target="_blank"
                            rel="noreferrer"
                            className="text-brand-600 hover:underline font-mono truncate max-w-[180px] inline-block"
                          >
                            {p.join_url || "Enlace no indicado"}
                          </a>
                        ) : (
                          <span className="font-medium text-slate-700">{roomName(p.room_id)}</span>
                        )}
                      </Td>
                      <Td>
                        <div className="flex items-center gap-1.5">
                          <Button
                            className="!px-2.5 !py-1 text-xs"
                            disabled={review.isPending}
                            onClick={() => approve(p.id)}
                          >
                            Aprobar
                          </Button>
                          <Button
                            variant="danger"
                            className="!px-2.5 !py-1 text-xs"
                            disabled={review.isPending}
                            onClick={() => setRejecting(p.id)}
                          >
                            Rechazar
                          </Button>
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          )}

        </div>
      </Modal>

      {rejecting != null && (
        <PromptModal
          title="Rechazar propuesta"
          label="Motivo del rechazo (opcional)"
          placeholder="Ej. favor utilizar el Aula 2 disponible"
          confirmLabel="Rechazar propuesta"
          confirmVariant="danger"
          multiline
          busy={review.isPending}
          onClose={() => setRejecting(null)}
          onSubmit={(note: string) =>
            review.mutate(
              { id: rejecting, action: "reject", note: note || undefined },
              {
                onSuccess: () => {
                  setRejecting(null);
                  notify("Propuesta rechazada", "success");
                },
                onError: (e) => {
                  setRejecting(null);
                  onMutationError("No se pudo revisar la propuesta")(e);
                },
              },
            )
          }
        />
      )}
    </>
  );
}
