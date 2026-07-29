import { useState } from "react";

import { Badge, Button, Card, Field, Input, Table, Td, Th } from "../../components/ui";
import { useCreateTenant, useTenants, useUpdateTenant } from "../../lib/queries";
import { notify } from "../../lib/toast";
import { onMutationError } from "./shared";

// The slug is what identifies an academy outside the database, so it is kept to
// the characters that survive a URL untouched.
const SLUG_RE = /^[a-z0-9-]+$/;

const EMPTY = { name: "", slug: "", max_active_students: 100 };

export function TenantsPanel() {
  const { data: tenants = [], isLoading } = useTenants();
  const create = useCreateTenant();
  const update = useUpdateTenant();
  const [form, setForm] = useState(EMPTY);

  const slugTaken = tenants.some((t) => t.slug === form.slug.trim());
  const slugValid = SLUG_RE.test(form.slug.trim());
  const canSubmit =
    form.name.trim().length > 0 && slugValid && !slugTaken && !create.isPending;

  const active = tenants.filter((t) => t.is_active).length;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="text-xs font-medium text-slate-500">Academias registradas</div>
          <div className="mt-1 font-serif text-2xl font-bold text-slate-900">
            {tenants.length}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-400">Instituciones en la plataforma</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="text-xs font-medium text-slate-500">Activas</div>
          <div className="mt-1 font-serif text-2xl font-bold text-brand-700">{active}</div>
          <div className="mt-0.5 text-[11px] text-slate-400">Con acceso habilitado</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="text-xs font-medium text-slate-500">Suspendidas</div>
          <div className="mt-1 font-serif text-2xl font-bold text-amber-700">
            {tenants.length - active}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-400">Sin acceso hasta reactivar</div>
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-3">
        <Card className="space-y-4 rounded-2xl border border-slate-200/80 p-5 shadow-2xs lg:col-span-1">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-sm font-bold text-slate-900">Nueva academia</h3>
            <p className="mt-0.5 text-[11px] text-slate-500">
              El slug identifica a la institución en URLs y no puede repetirse.
            </p>
          </div>

          <div className="space-y-3.5 text-xs">
            <Field label="Nombre (*)">
              <Input
                placeholder="Ej. Academia Internacional"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>

            <Field label="Slug (*)">
              <Input
                placeholder="ej. internacional"
                value={form.slug}
                onChange={(e) =>
                  setForm({ ...form, slug: e.target.value.toLowerCase() })
                }
              />
              {form.slug.trim() !== "" && !slugValid && (
                <p className="mt-1 text-[11px] text-red-600">
                  Solo minúsculas, números y guiones.
                </p>
              )}
              {slugTaken && (
                <p className="mt-1 text-[11px] text-red-600">
                  Ya existe una academia con este slug.
                </p>
              )}
            </Field>

            <Field label="Límite de alumnos activos">
              <Input
                type="number"
                min={1}
                value={form.max_active_students}
                onChange={(e) =>
                  setForm({
                    ...form,
                    max_active_students: Number(e.target.value) || 0,
                  })
                }
              />
            </Field>

            <Button
              className="w-full !py-2 text-xs font-semibold"
              disabled={!canSubmit}
              onClick={() =>
                create.mutate(
                  {
                    name: form.name.trim(),
                    slug: form.slug.trim(),
                    max_active_students: form.max_active_students,
                  },
                  {
                    onSuccess: () => {
                      setForm(EMPTY);
                      notify("Academia creada correctamente", "success");
                    },
                    onError: onMutationError("No se pudo crear la academia"),
                  },
                )
              }
            >
              {create.isPending ? "Creando…" : "+ Crear academia"}
            </Button>
          </div>
        </Card>

        <Card className="space-y-4 rounded-2xl border border-slate-200/80 p-5 shadow-2xs lg:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-sm font-bold text-slate-900">Academias</h3>
            <span className="text-xs font-medium text-slate-500">
              {tenants.length} registrada(s)
            </span>
          </div>

          {isLoading ? (
            <p className="py-8 text-center text-xs italic text-slate-400">Cargando…</p>
          ) : tenants.length === 0 ? (
            <p className="py-8 text-center text-xs italic text-slate-400">
              Aún no hay academias registradas.
            </p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Academia</Th>
                  <Th>Slug</Th>
                  <Th>Cupo</Th>
                  <Th>Estado</Th>
                  <th className="bg-slate-50 px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Acción
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {tenants.map((t) => (
                  <tr key={t.id} className="transition hover:bg-slate-50/70">
                    <Td>
                      <span className="font-medium text-slate-800">{t.name}</span>
                    </Td>
                    <Td>
                      <span className="font-mono text-slate-600">{t.slug}</span>
                    </Td>
                    <Td>{t.max_active_students}</Td>
                    <Td>
                      <Badge color={t.is_active ? "indigo" : "slate"}>
                        {t.is_active ? "Activa" : "Suspendida"}
                      </Badge>
                    </Td>
                    <td className="px-4 py-2.5 text-right text-slate-700">
                      <Button
                        variant="ghost"
                        className="!px-2 !py-0.5 text-xs"
                        disabled={update.isPending}
                        onClick={() =>
                          update.mutate(
                            { id: t.id, is_active: !t.is_active },
                            {
                              onSuccess: () =>
                                notify(
                                  t.is_active
                                    ? "Academia suspendida"
                                    : "Academia reactivada",
                                  "success",
                                ),
                              onError: onMutationError(
                                "No se pudo cambiar el estado",
                              ),
                            },
                          )
                        }
                      >
                        {t.is_active ? "Suspender" : "Reactivar"}
                      </Button>
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
