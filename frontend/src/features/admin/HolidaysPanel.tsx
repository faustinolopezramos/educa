import { useState } from "react";

import {
  ActionMenu,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  MetaItem,
  PageHeader,
  SearchInput,
  Table,
  Td,
  Th,
} from "../../components/ui";
import { IconCalendar } from "../../components/icons";
import { useCreateHoliday, useDeleteHoliday, useHolidays } from "../../lib/queries";
import { notify } from "../../lib/toast";
import { onMutationError } from "./shared";

export function HolidaysPanel() {
  const { data: holidays = [] } = useHolidays();
  const create = useCreateHoliday();
  const del = useDeleteHoliday();
  const [form, setForm] = useState({ date: "", name: "" });
  const [searchTerm, setSearchTerm] = useState("");

  const filteredHolidays = holidays.filter((h) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return h.name.toLowerCase().includes(term) || h.date.includes(term);
  });

  // Ordenados por fecha: un calendario que se lee de arriba abajo.
  const sorted = [...filteredHolidays].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div>
      {/* Antes esta pantalla abría con tres tarjetas KPI, de las cuales dos
          mostraban texto fijo ("Automático", "Activo · Año académico 2026")
          que no se calculaba a partir de ningún dato. */}
      <PageHeader
        title="Días festivos"
        description="Las sesiones programadas saltan automáticamente estas fechas."
        meta={<MetaItem value={holidays.length} label="días registrados" />}
      />

      <div className="grid items-start gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-sm font-semibold text-slate-900">Nuevo día festivo</h3>
          </div>

          <div className="mt-4 space-y-3.5">
            <Field label="Fecha">
              <Input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </Field>

            <Field label="Motivo">
              <Input
                placeholder="Ej. Día de la Independencia"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>

            <Button
              className="w-full"
              disabled={!form.date || !form.name.trim() || create.isPending}
              onClick={() =>
                create.mutate(form, {
                  onSuccess: () => {
                    setForm({ date: "", name: "" });
                    notify("Festivo registrado", "success");
                  },
                  onError: onMutationError("No se pudo crear el festivo"),
                })
              }
            >
              {create.isPending ? "Registrando…" : "Añadir día festivo"}
            </Button>
          </div>
        </Card>

        <Card padding="none" className="overflow-hidden lg:col-span-2">
          <div className="border-b border-slate-200 p-2.5">
            <SearchInput
              className="max-w-xs"
              placeholder="Buscar por fecha o motivo"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {sorted.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={<IconCalendar className="h-5 w-5" />}
                title={searchTerm ? "Ningún festivo coincide" : "Todavía no hay festivos"}
                message={
                  searchTerm
                    ? "Prueba con otra fecha o motivo."
                    : "Añade el primero para que las sesiones lo salten al generarse."
                }
              />
            </div>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Fecha</Th>
                  <Th>Motivo</Th>
                  <Th align="right">Acciones</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sorted.map((h) => (
                  <tr key={h.id} className="hover:bg-slate-50">
                    <Td>
                      <span className="tabular font-medium text-slate-900">{h.date}</span>
                    </Td>
                    <Td>{h.name}</Td>
                    <Td align="right">
                      <ActionMenu
                        items={[
                          {
                            label: "Eliminar día festivo",
                            onClick: () =>
                              del.mutate(h.id, {
                                onSuccess: () => notify("Festivo eliminado", "success"),
                                onError: onMutationError("No se pudo eliminar"),
                              }),
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
    </div>
  );
}
