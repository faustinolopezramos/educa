import { useState } from "react";

import {
  ActionMenu, Badge, Button, Card, ConfirmDialog, EmptyState, Field, Input, MetaItem,
  PageHeader, SearchInput, Table, Td, Th,
} from "../../components/ui";
import { IconDoor } from "../../components/icons";
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
  const [searchTerm, setSearchTerm] = useState("");

  const virtualCount = rooms.filter((r) => r.is_virtual).length;
  const physicalCount = rooms.length - virtualCount;

  const filteredRooms = rooms.filter((r) => {
    if (!searchTerm.trim()) return true;
    return r.name.toLowerCase().includes(searchTerm.toLowerCase());
  });

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
          notify("Aula creada correctamente", "success");
        },
        onError: onMutationError("No se pudo crear el aula"),
      },
    );
  }

  return (
    <div>
      {/* Los recuentos viven en la cabecera. Antes ocupaban tres tarjetas KPI
          a ancho completo, dos de ellas con valores fijos escritos a mano
          ("Automático", "Activo") que no medían nada. */}
      <PageHeader
        title="Aulas"
        description="Espacios físicos y salas virtuales disponibles para programar clases."
        meta={
          <>
            <MetaItem value={rooms.length} label="en total" />
            <MetaItem value={physicalCount} label="presenciales" />
            <MetaItem value={virtualCount} label="virtuales" />
          </>
        }
      />

      <div className="grid items-start gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-sm font-semibold text-slate-900">Nueva aula</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Un aula física o una sala virtual.
            </p>
          </div>

          <div className="mt-4 space-y-3.5">
            <Field label="Nombre del Aula / Sala" required={true}>
              <Input
                placeholder="Ej. Aula 102 o Sala Zoom 1"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>

            <Field label="Capacidad" hint="Déjala vacía si no hay límite.">
              <Input
                type="number"
                min={1}
                placeholder="Ej. 25"
                value={form.capacity}
                onChange={(e) =>
                  setForm({
                    ...form,
                    capacity: e.target.value === "" ? "" : Number(e.target.value),
                  })
                }
              />
            </Field>

            <label className="flex cursor-pointer items-center gap-2.5 text-sm text-slate-700">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                checked={form.is_virtual}
                onChange={(e) => setForm({ ...form, is_virtual: e.target.checked })}
              />
              <span>Es una sala virtual</span>
            </label>

            <Button className="w-full" disabled={create.isPending} onClick={submit}>
              {create.isPending ? "Creando…" : "Registrar aula"}
            </Button>
          </div>
        </Card>

        <Card padding="none" className="overflow-hidden lg:col-span-2">
          <div className="border-b border-slate-200 p-2.5">
            <SearchInput
              className="max-w-xs"
              placeholder="Buscar por nombre"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {filteredRooms.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={<IconDoor className="h-5 w-5" />}
                title={searchTerm ? "Ningún aula coincide" : "Todavía no hay aulas"}
                message={
                  searchTerm
                    ? "Prueba con otro nombre."
                    : "Registra la primera con el formulario de la izquierda."
                }
              />
            </div>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Aula</Th>
                  <Th align="right">Capacidad</Th>
                  <Th>Modalidad</Th>
                  <Th align="right">Acciones</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRooms.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <Td>
                      <span className="font-medium text-slate-900">{r.name}</span>
                    </Td>
                    <Td align="right">
                      <span className="tabular">
                        {r.capacity ? r.capacity : <span className="text-slate-400">Sin límite</span>}
                      </span>
                    </Td>
                    <Td>
                      <Badge color={r.is_virtual ? "indigo" : "slate"}>
                        {r.is_virtual ? "Virtual" : "Presencial"}
                      </Badge>
                    </Td>
                    <Td align="right">
                      <ActionMenu
                        items={[
                          {
                            label: r.is_virtual
                              ? "Convertir en aula física"
                              : "Convertir en sala virtual",
                            onClick: () =>
                              update.mutate(
                                { id: r.id, is_virtual: !r.is_virtual },
                                {
                                  onSuccess: () =>
                                    notify("Modalidad del aula actualizada", "success"),
                                  onError: onMutationError("No se pudo actualizar"),
                                },
                              ),
                          },
                          {
                            label: "Eliminar aula",
                            onClick: () => setToDelete(r),
                            danger: true,
                          },
                        ]}
                      />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>

      {toDelete && (
        <ConfirmDialog
          title="Eliminar aula"
          message={
            <>
              ¿Eliminar el aula <strong>{toDelete.name}</strong>? Las clases que la utilicen
              quedarán marcadas como virtuales.
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
