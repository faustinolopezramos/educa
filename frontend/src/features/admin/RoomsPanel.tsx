import { useState } from "react";

import { Badge, Button, Card, ConfirmDialog, Field, Input, Table, Td, Th } from "../../components/ui";
import { useCreateRoom, useDeleteRoom, useRooms, useUpdateRoom } from "../../lib/queries";
import { notify } from "../../lib/toast";
import type { Room } from "../../lib/types";
import { onMutationError } from "./shared";

export function RoomsPanel() {
  const { data: rooms = [] } = useRooms();
  const create = useCreateRoom();
  const update = useUpdateRoom();
  const del = useDeleteRoom();
  const [form, setForm] = useState({ name: "", capacity: "" as number | "", is_virtual: false });
  const [toDelete, setToDelete] = useState<Room | null>(null);

  function submit() {
    if (!form.name.trim()) {
      notify("El nombre del aula es obligatorio", "error");
      return;
    }
    create.mutate(
      {
        name: form.name,
        capacity: form.capacity === "" ? null : Number(form.capacity),
        is_virtual: form.is_virtual,
      },
      {
        onSuccess: () => {
          setForm({ name: "", capacity: "", is_virtual: false });
          notify("Aula creada", "success");
        },
        onError: onMutationError("No se pudo crear el aula"),
      },
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-1">
        <h3 className="mb-3 font-medium">Nueva aula</h3>
        <div className="space-y-3">
          <Field label="Nombre">
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <Field label="Capacidad (opcional)">
            <Input
              type="number"
              min={1}
              value={form.capacity}
              onChange={(e) =>
                setForm({
                  ...form,
                  capacity: e.target.value === "" ? "" : Number(e.target.value),
                })
              }
            />
          </Field>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.is_virtual}
              onChange={(e) => setForm({ ...form, is_virtual: e.target.checked })}
            />
            Aula virtual
          </label>
          <Button className="w-full" disabled={create.isPending} onClick={submit}>
            Crear aula
          </Button>
        </div>
      </Card>
      <Card className="lg:col-span-2">
        <Table>
          <thead>
            <tr>
              <Th>Aula</Th>
              <Th>Capacidad</Th>
              <Th>Tipo</Th>
              <Th>Acciones</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rooms.map((r) => (
              <tr key={r.id}>
                <Td>{r.name}</Td>
                <Td>{r.capacity ?? "—"}</Td>
                <Td>
                  <Badge color={r.is_virtual ? "indigo" : "slate"}>
                    {r.is_virtual ? "Virtual" : "Física"}
                  </Badge>
                </Td>
                <Td>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      onClick={() =>
                        update.mutate(
                          { id: r.id, is_virtual: !r.is_virtual },
                          { onError: onMutationError("No se pudo actualizar") },
                        )
                      }
                    >
                      Cambiar tipo
                    </Button>
                    <Button variant="ghost" onClick={() => setToDelete(r)}>
                      Eliminar
                    </Button>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      {toDelete && (
        <ConfirmDialog
          title="Eliminar aula"
          message={
            <>
              ¿Eliminar <strong>{toDelete.name}</strong>? Los horarios que la usen
              quedarán sin aula asignada.
            </>
          }
          busy={del.isPending}
          onClose={() => setToDelete(null)}
          onConfirm={() =>
            del.mutate(toDelete.id, {
              onSuccess: () => {
                setToDelete(null);
                notify("Aula eliminada", "success");
              },
              onError: (e) => {
                setToDelete(null);
                onMutationError("No se pudo eliminar")(e);
              },
            })
          }
        />
      )}
    </div>
  );
}
