import { useState } from "react";

import { Badge, Button, Card, EmptyState, SectionHeading, Table, Td, Th } from "../../components/ui";
import { PromptModal } from "../../components/PromptModal";
import { ClassLocation } from "../../components/ClassLocation";
import { useLocationProposals, useReviewProposal, useRooms, useUsers } from "../../lib/queries";
import { notify } from "../../lib/toast";
import { onMutationError } from "./shared";
import { modalityColor, modalityLabel } from "../../lib/format";

export function LocationProposalsPanel() {
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
    <Card>
      <SectionHeading>Propuestas de ubicación pendientes</SectionHeading>
      {pending.length === 0 ? (
        <EmptyState
          icon="✓"
          title="Sin propuestas por revisar"
          message="Cuando un profesor proponga dónde dar su clase, aparecerá aquí para tu aprobación."
        />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Profesor</Th>
              <Th>Modalidad</Th>
              <Th>Detalle</Th>
              <Th>Acciones</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {pending.map((p) => (
              <tr key={p.id}>
                <Td>{teacherName(p.proposed_by)}</Td>
                <Td>
                  <Badge color={modalityColor(p.modality)}>
                    {modalityLabel(p.modality)}
                  </Badge>
                </Td>
                <Td>
                  <ClassLocation
                    modality={p.modality}
                    roomName={roomName(p.room_id)}
                    joinUrl={p.join_url}
                  />
                </Td>
                <Td>
                  <div className="flex gap-1">
                    <Button
                      className="px-2 py-1 text-xs"
                      disabled={review.isPending}
                      onClick={() => approve(p.id)}
                    >
                      Aprobar
                    </Button>
                    <Button
                      variant="danger"
                      className="px-2 py-1 text-xs"
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
      )}
      {rejecting != null && (
        <PromptModal
          title="Rechazar propuesta"
          label="Motivo del rechazo (opcional)"
          placeholder="Ej. usa el aula 3 en lugar de virtual"
          confirmLabel="Rechazar"
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
    </Card>
  );
}
