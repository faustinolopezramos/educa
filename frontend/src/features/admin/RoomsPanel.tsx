import { useState } from "react";

import { ActionMenu, Badge, Button, Card, ConfirmDialog, Field, Input, Table, Td, Th } from "../../components/ui";
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
    <div className="space-y-5">
      {/* Header Dashboard Metrics Bar */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="text-xs text-slate-500 font-medium">Total Aulas e Infraestructura</div>
          <div className="mt-1 font-serif text-2xl font-bold text-slate-900">{rooms.length}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">Espacios habilitados para docencia</div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="text-xs text-slate-500 font-medium">Aulas Físicas / Presenciales</div>
          <div className="mt-1 font-serif text-2xl font-bold text-slate-800">{physicalCount}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">Espacios físicos en sede</div>
        </div>

        <div className="rounded-2xl border border-brand-200 bg-brand-50/50 p-4 shadow-2xs">
          <div className="text-xs text-brand-900 font-medium">Salas Virtuales Online</div>
          <div className="mt-1 font-serif text-2xl font-bold text-brand-700">{virtualCount}</div>
          <div className="text-[11px] text-brand-600 mt-0.5">Videoconferencias integradas</div>
        </div>
      </div>

      {/* Main Grid: Clean Creation Card + Filterable Table */}
      <div className="grid gap-6 lg:grid-cols-3 items-start">
        <Card className="lg:col-span-1 space-y-4 border border-slate-200/80 rounded-2xl p-5 shadow-2xs">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="font-bold text-slate-900 text-sm">Nueva Aula</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Registra un aula física o sala de clases virtual.
            </p>
          </div>

          <div className="space-y-3.5 text-xs">
            <Field label="Nombre del Aula (*)">
              <Input
                placeholder="Ej. Aula 102, Sala Virtual Zoom A"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>

            <Field label="Capacidad de Alumnos (opcional)">
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

            <label className="flex items-center gap-2 text-xs text-slate-800 font-medium cursor-pointer bg-slate-50 p-2.5 rounded-xl border border-slate-200">
              <input
                type="checkbox"
                className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                checked={form.is_virtual}
                onChange={(e) => setForm({ ...form, is_virtual: e.target.checked })}
              />
              <span>Es un aula virtual (online / síncrona)</span>
            </label>

            <Button
              className="w-full !py-2 text-xs font-semibold"
              disabled={create.isPending}
              onClick={submit}
            >
              {create.isPending ? "Creando…" : "+ Registrar Aula"}
            </Button>
          </div>
        </Card>

        {/* Minimalist Table Card */}
        <Card className="lg:col-span-2 space-y-4 border border-slate-200/80 rounded-2xl p-5 shadow-2xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <Input
              className="max-w-xs text-xs"
              placeholder="Buscar por nombre de aula…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <span className="text-xs text-slate-500 font-medium">
              {filteredRooms.length} espacio(s)
            </span>
          </div>

          {filteredRooms.length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-400 italic">
              No hay aulas registradas que coincidan con los criterios de búsqueda.
            </p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Aula / Espacio</Th>
                  <Th>Capacidad</Th>
                  <Th>Modalidad</Th>
                  <th className="bg-slate-50 px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredRooms.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/70 transition">
                    <Td>
                      <span className="font-bold text-slate-900">{r.name}</span>
                    </Td>
                    <Td>
                      <span className="font-mono text-slate-700">
                        {r.capacity ? `${r.capacity} alumnos` : "Sin límite"}
                      </span>
                    </Td>
                    <Td>
                      <Badge color={r.is_virtual ? "indigo" : "slate"}>
                        {r.is_virtual ? "Virtual" : "Presencial"}
                      </Badge>
                    </Td>
                    <td className="px-4 py-2.5 text-right text-slate-700">
                      <ActionMenu
                        items={[
                          {
                            label: r.is_virtual ? "Cambiar a Aula Física" : "Cambiar a Sala Virtual",
                            onClick: () =>
                              update.mutate(
                                { id: r.id, is_virtual: !r.is_virtual },
                                {
                                  onSuccess: () => notify("Modalidad de aula actualizada", "success"),
                                  onError: onMutationError("No se pudo actualizar"),
                                },
                              ),
                          },
                          {
                            label: "Eliminar Aula",
                            onClick: () => setToDelete(r),
                            danger: true,
                          },
                        ]}
                      />
                    </td>
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
