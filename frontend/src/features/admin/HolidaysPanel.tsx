import { useState } from "react";

import { ActionMenu, Button, Card, Field, Input, Table, Td, Th } from "../../components/ui";
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

  return (
    <div className="space-y-5">
      {/* Header Dashboard Metrics Bar */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="text-xs text-slate-500 font-medium">Días Festivos Registrados</div>
          <div className="mt-1 font-serif text-2xl font-bold text-slate-900">{holidays.length}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">Días sin clases lectivas</div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="text-xs text-slate-500 font-medium">Impacto en Asistencias</div>
          <div className="mt-1 font-serif text-2xl font-bold text-amber-700">Automático</div>
          <div className="text-[11px] text-slate-400 mt-0.5">Omisión automática en sesiones</div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="text-xs text-slate-500 font-medium">Calendario Lectivo</div>
          <div className="mt-1 font-serif text-2xl font-bold text-brand-700">Activo</div>
          <div className="text-[11px] text-slate-400 mt-0.5">Año académico 2026</div>
        </div>
      </div>

      {/* Main Grid: Clean Creation Card + Filterable Table */}
      <div className="grid gap-6 lg:grid-cols-3 items-start">
        <Card className="lg:col-span-1 space-y-4 border border-slate-200/80 rounded-2xl p-5 shadow-2xs">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="font-bold text-slate-900 text-sm">Nuevo Día Festivo</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Las sesiones programadas omitirán automáticamente esta fecha.
            </p>
          </div>

          <div className="space-y-3.5 text-xs">
            <Field label="Fecha del Festivo (*)">
              <Input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </Field>

            <Field label="Nombre / Motivo (*)">
              <Input
                placeholder="Ej. Día de la Independencia, Asueto Oficial"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>

            <Button
              className="w-full !py-2 text-xs font-semibold"
              disabled={!form.date || !form.name.trim() || create.isPending}
              onClick={() =>
                create.mutate(form, {
                  onSuccess: () => {
                    setForm({ date: "", name: "" });
                    notify("Festivo registrado correctamente", "success");
                  },
                  onError: onMutationError("No se pudo crear el festivo"),
                })
              }
            >
              {create.isPending ? "Registrando…" : "+ Añadir Día Festivo"}
            </Button>
          </div>
        </Card>

        {/* Minimalist Table Card */}
        <Card className="lg:col-span-2 space-y-4 border border-slate-200/80 rounded-2xl p-5 shadow-2xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <Input
              className="max-w-xs text-xs"
              placeholder="Buscar por fecha o nombre de festivo…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <span className="text-xs text-slate-500 font-medium">
              {filteredHolidays.length} día(s) registrado(s)
            </span>
          </div>

          {filteredHolidays.length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-400 italic">
              No hay días festivos registrados que coincidan con la búsqueda.
            </p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Fecha Lectiva Libre</Th>
                  <Th>Motivo / Festividad</Th>
                  <th className="bg-slate-50 px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Acción
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredHolidays.map((h) => (
                  <tr key={h.id} className="hover:bg-slate-50/70 transition">
                    <Td>
                      <span className="font-mono font-semibold text-slate-900">{h.date}</span>
                    </Td>
                    <Td>
                      <span className="font-medium text-slate-800">{h.name}</span>
                    </Td>
                    <td className="px-4 py-2.5 text-right text-slate-700">
                      <ActionMenu
                        items={[
                          {
                            label: "Eliminar Día Festivo",
                            onClick: () =>
                              del.mutate(h.id, {
                                onSuccess: () => notify("Festivo eliminado", "success"),
                                onError: onMutationError("No se pudo eliminar"),
                              }),
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
    </div>
  );
}
