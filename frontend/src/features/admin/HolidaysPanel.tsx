import { useState } from "react";

import { Button, Card, Field, Input, Table, Td, Th } from "../../components/ui";
import { useCreateHoliday, useDeleteHoliday, useHolidays } from "../../lib/queries";
import { onMutationError } from "./shared";

export function HolidaysPanel() {
  const { data: holidays = [] } = useHolidays();
  const create = useCreateHoliday();
  const del = useDeleteHoliday();
  const [form, setForm] = useState({ date: "", name: "" });

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-1">
        <h3 className="mb-3 font-medium">Nuevo festivo</h3>
        <p className="mb-3 text-xs text-slate-400">
          La generación de sesiones salta estos días.
        </p>
        <div className="space-y-3">
          <Field label="Fecha">
            <Input
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
            />
          </Field>
          <Field label="Nombre">
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <Button
            className="w-full"
            disabled={!form.date || !form.name.trim() || create.isPending}
            onClick={() =>
              create.mutate(form, {
                onSuccess: () => setForm({ date: "", name: "" }),
                onError: onMutationError("No se pudo crear el festivo"),
              })
            }
          >
            Añadir festivo
          </Button>
        </div>
      </Card>
      <Card className="lg:col-span-2">
        {holidays.length === 0 ? (
          <p className="text-sm text-slate-400">Sin festivos registrados.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Fecha</Th>
                <Th>Nombre</Th>
                <Th>Acción</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {holidays.map((h) => (
                <tr key={h.id}>
                  <Td>{h.date}</Td>
                  <Td>{h.name}</Td>
                  <Td>
                    <Button
                      variant="ghost"
                      className="px-2 py-0.5 text-xs"
                      onClick={() =>
                        del.mutate(h.id, {
                          onError: onMutationError("No se pudo eliminar"),
                        })
                      }
                    >
                      Eliminar
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
