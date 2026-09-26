import { useState } from "react";

import {
  Badge,
  Button,
  EmptyState,
  Field,
  Input,
  MetaItem,
  Modal,
  ModalActions,
  PageHeader,
  SectionHeading,
  Select,
  SkeletonRows,
} from "../../components/ui";
import {
  useCreateTenant,
  useCreateTenantAdmin,
  useTenantAdmins,
  useTenants,
  useUpdateTenant,
} from "../../lib/queries";
import { notify } from "../../lib/toast";
import type { Tenant } from "../../lib/types";
import { onMutationError } from "./shared";

/**
 * Las academias de la plataforma, para el superadmin.
 *
 * Antes era un formulario de alta y una tabla con un solo botón, «Suspender»,
 * que además no suspendía nada. No había forma de corregir una academia después
 * de crearla, de darle su primer administrador —nacía sin nadie que pudiera
 * entrar a gestionarla— ni de ver cuánto de su plan estaba usando. Ahora:
 *
 * - cada academia enseña sus matrículas activas contra el límite contratado
 *   (el límite cuenta plazas, no personas: un alumno en dos cursos ocupa dos),
 *   y avisa si no tiene administrador;
 * - tocarla abre su ficha: datos, administradores y estado;
 * - crear una academia sigue con el alta de su primer administrador.
 *
 * Los campos del modelo que nada usa todavía (logo, colores, dominio, moneda)
 * no se ofrecen: un formulario que los pide promete un efecto que no ocurre.
 */

// The slug is what identifies an academy outside the database, so it is kept to
// the characters that survive a URL untouched.
const SLUG_RE = /^[a-z0-9-]+$/;

const TIMEZONES = [
  "America/Guatemala",
  "America/El_Salvador",
  "America/Tegucigalpa",
  "America/Managua",
  "America/Costa_Rica",
  "America/Panama",
  "America/Mexico_City",
  "America/Bogota",
  "America/Lima",
  "America/Santiago",
  "America/Argentina/Buenos_Aires",
  "America/New_York",
  "Europe/Madrid",
];

/** "Academia Internacional Ñandú" → "academia-internacional-nandu". */
function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

/** How full the plan is: slate below 80 %, amber up to the limit, red at it. */
function usageTone(t: Tenant): { bar: string; text: string } {
  const ratio = t.max_active_students ? t.active_students / t.max_active_students : 0;
  if (ratio >= 1) return { bar: "bg-red-500", text: "text-red-700" };
  if (ratio >= 0.8) return { bar: "bg-amber-500", text: "text-amber-700" };
  return { bar: "bg-brand-500", text: "text-slate-600" };
}

export function TenantsPanel() {
  const { data: tenants = [], isLoading } = useTenants();
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);

  const active = tenants.filter((t) => t.is_active).length;
  const orphaned = tenants.filter((t) => t.is_active && t.admins === 0).length;
  const open = tenants.find((t) => t.id === openId) ?? null;

  return (
    <div>
      <PageHeader
        title="Academias"
        description="Las instituciones que usan la plataforma, su plan y quién las administra."
        meta={
          <>
            <MetaItem
              value={tenants.length}
              label={tenants.length === 1 ? "academia" : "academias"}
            />
            <MetaItem value={active} label={active === 1 ? "activa" : "activas"} />
            {tenants.length - active > 0 && (
              <MetaItem
                value={tenants.length - active}
                label={tenants.length - active === 1 ? "suspendida" : "suspendidas"}
              />
            )}
          </>
        }
        actions={<Button onClick={() => setCreating(true)}>Nueva academia</Button>}
      />

      {orphaned > 0 && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {orphaned === 1
            ? "Una academia activa no tiene administrador: nadie puede entrar a gestionarla."
            : `${orphaned} academias activas no tienen administrador: nadie puede entrar a gestionarlas.`}
        </div>
      )}

      {isLoading ? (
        <SkeletonRows rows={3} />
      ) : tenants.length === 0 ? (
        <EmptyState
          title="Aún no hay academias"
          message="Crea la primera y dale su administrador para que pueda empezar a trabajar."
          action={<Button onClick={() => setCreating(true)}>Nueva academia</Button>}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {tenants.map((t) => (
            <TenantCard key={t.id} tenant={t} onOpen={() => setOpenId(t.id)} />
          ))}
        </div>
      )}

      {creating && (
        <NewTenantModal
          onClose={() => setCreating(false)}
          takenSlugs={tenants.map((t) => t.slug)}
        />
      )}
      {open && <TenantModal tenant={open} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function TenantCard({ tenant: t, onOpen }: { tenant: Tenant; onOpen: () => void }) {
  const tone = usageTone(t);
  const pct = t.max_active_students
    ? Math.min(100, Math.round((t.active_students / t.max_active_students) * 100))
    : 0;

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`flex flex-col rounded-xl border bg-white p-4 text-left transition-colors hover:border-brand-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 ${
        t.is_active ? "border-slate-200" : "border-slate-200 opacity-70"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-slate-900">{t.name}</p>
          <p className="truncate font-mono text-xs text-slate-500">{t.slug}</p>
        </div>
        <Badge color={t.is_active ? "green" : "slate"}>
          {t.is_active ? "Activa" : "Suspendida"}
        </Badge>
      </div>

      <div className="mt-4">
        <div className="flex items-baseline justify-between text-xs">
          <span className="text-slate-500">Matrículas activas</span>
          <span className={`tabular font-semibold ${tone.text}`}>
            {t.active_students} / {t.max_active_students}
          </span>
        </div>
        <div
          className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100"
          role="progressbar"
          aria-valuenow={t.active_students}
          aria-valuemin={0}
          aria-valuemax={t.max_active_students}
          aria-label="Matrículas activas sobre el límite del plan"
        >
          <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${pct}%` }} />
        </div>
      </div>

      <p className="mt-3 text-xs">
        {t.admins === 0 ? (
          <span className="font-semibold text-amber-700">Sin administrador</span>
        ) : (
          <span className="text-slate-500">
            {t.admins === 1 ? "1 administrador" : `${t.admins} administradores`}
          </span>
        )}
      </p>
    </button>
  );
}

/* ------------------------------------------------------------------ *
 * Alta: la academia y, a continuación, su primer administrador
 * ------------------------------------------------------------------ */

function NewTenantModal({
  onClose,
  takenSlugs,
}: {
  onClose: () => void;
  takenSlugs: string[];
}) {
  const create = useCreateTenant();
  const [created, setCreated] = useState<Tenant | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [limit, setLimit] = useState(100);
  const [timezone, setTimezone] = useState("America/Guatemala");

  if (created) {
    return (
      <Modal
        title={`Primer administrador de ${created.name}`}
        description="Sin administrador nadie puede entrar a gestionar la academia."
        onClose={onClose}
        maxWidth="max-w-md"
      >
        <AdminForm
          tenant={created}
          submitLabel="Crear administrador"
          secondary={
            <Button variant="secondary" onClick={onClose}>
              Lo haré después
            </Button>
          }
          onDone={onClose}
        />
      </Modal>
    );
  }

  const finalSlug = (slugEdited ? slug : slugify(name)).trim();
  const slugValid = SLUG_RE.test(finalSlug);
  const slugTaken = takenSlugs.includes(finalSlug);
  const canSubmit =
    name.trim().length > 0 && slugValid && !slugTaken && limit >= 1 && !create.isPending;

  function submit() {
    create.mutate(
      { name: name.trim(), slug: finalSlug, max_active_students: limit, timezone },
      {
        onSuccess: (tenant) => {
          notify("Academia creada", "success");
          setCreated(tenant);
        },
        onError: onMutationError("No se pudo crear la academia"),
      },
    );
  }

  return (
    <Modal
      title="Nueva academia"
      description="Paso 1 de 2: los datos de la institución. Después, su administrador."
      onClose={onClose}
      maxWidth="max-w-md"
      footer={
        <ModalActions>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={!canSubmit} onClick={submit}>
            {create.isPending ? "Creando…" : "Crear y continuar"}
          </Button>
        </ModalActions>
      }
    >
      <div className="space-y-3.5">
        <Field label="Nombre">
          <Input
            autoFocus
            placeholder="Ej. Academia Internacional"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="Identificador (slug)">
          <Input
            value={finalSlug}
            onChange={(e) => {
              setSlugEdited(true);
              setSlug(e.target.value.toLowerCase());
            }}
          />
          <p className={`mt-1 text-xs ${!slugValid && finalSlug ? "text-red-600" : "text-slate-500"}`}>
            {slugTaken
              ? "Ya existe una academia con este identificador."
              : !slugValid && finalSlug
                ? "Sólo minúsculas, números y guiones."
                : "Sirve para elegir academia al iniciar sesión. No puede repetirse."}
          </p>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Límite de matrículas activas">
            <Input
              type="number"
              min={1}
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value) || 0)}
            />
          </Field>
          <Field label="Zona horaria">
            <TimezoneSelect value={timezone} onChange={setTimezone} />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ *
 * Ficha de una academia
 * ------------------------------------------------------------------ */

function TenantModal({ tenant, onClose }: { tenant: Tenant; onClose: () => void }) {
  const [tab, setTab] = useState<"datos" | "admins" | "estado">(
    tenant.admins === 0 ? "admins" : "datos",
  );

  return (
    <Modal
      title={tenant.name}
      description={
        <span className="tabular">
          {tenant.active_students} de {tenant.max_active_students} matrículas activas ·{" "}
          {tenant.is_active ? "Activa" : "Suspendida"}
        </span>
      }
      onClose={onClose}
      maxWidth="max-w-lg"
    >
      <div role="tablist" className="mb-4 flex gap-1 border-b border-slate-200">
        {(
          [
            ["datos", "Datos"],
            ["admins", "Administradores"],
            ["estado", "Estado"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold transition-colors ${
              tab === id
                ? "border-brand-600 text-brand-700"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {label}
            {id === "admins" && tenant.admins === 0 && (
              <span className="ml-1.5 inline-block h-2 w-2 rounded-full bg-amber-500" />
            )}
          </button>
        ))}
      </div>

      {tab === "datos" && <TenantDetailsForm tenant={tenant} />}
      {tab === "admins" && <TenantAdmins tenant={tenant} />}
      {tab === "estado" && <TenantStatus tenant={tenant} onDone={onClose} />}
    </Modal>
  );
}

function TenantDetailsForm({ tenant }: { tenant: Tenant }) {
  const update = useUpdateTenant();
  const [form, setForm] = useState({
    name: tenant.name,
    max_active_students: tenant.max_active_students,
    timezone: tenant.timezone,
    phone: tenant.phone ?? "",
    tax_id: tenant.tax_id ?? "",
    address: tenant.address ?? "",
  });
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const belowUsage = form.max_active_students < tenant.active_students;
  const dirty =
    form.name !== tenant.name ||
    form.max_active_students !== tenant.max_active_students ||
    form.timezone !== tenant.timezone ||
    form.phone !== (tenant.phone ?? "") ||
    form.tax_id !== (tenant.tax_id ?? "") ||
    form.address !== (tenant.address ?? "");

  function save() {
    update.mutate(
      {
        id: tenant.id,
        name: form.name.trim(),
        max_active_students: form.max_active_students,
        timezone: form.timezone,
        phone: form.phone.trim() || null,
        tax_id: form.tax_id.trim() || null,
        address: form.address.trim() || null,
      },
      {
        onSuccess: () => notify("Cambios guardados", "success"),
        onError: onMutationError("No se pudieron guardar los cambios"),
      },
    );
  }

  return (
    <div className="space-y-3.5">
      <Field label="Nombre">
        <Input value={form.name} onChange={(e) => set({ name: e.target.value })} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Límite de matrículas activas">
          <Input
            type="number"
            min={1}
            value={form.max_active_students}
            onChange={(e) => set({ max_active_students: Number(e.target.value) || 0 })}
          />
        </Field>
        <Field label="Zona horaria">
          <TimezoneSelect value={form.timezone} onChange={(timezone) => set({ timezone })} />
        </Field>
      </div>
      {belowUsage && (
        <p className="text-xs text-amber-700">
          Ya tiene {tenant.active_students} matrículas activas. Con este límite no podrá
          matricular a nadie más hasta bajar de esa cifra.
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Teléfono">
          <Input value={form.phone} onChange={(e) => set({ phone: e.target.value })} />
        </Field>
        <Field label="NIT">
          <Input value={form.tax_id} onChange={(e) => set({ tax_id: e.target.value })} />
        </Field>
      </div>
      <Field label="Dirección">
        <Input value={form.address} onChange={(e) => set({ address: e.target.value })} />
      </Field>
      <p className="text-xs text-slate-500">
        Identificador: <span className="font-mono">{tenant.slug}</span> — no se cambia desde aquí
        porque es con lo que su gente elige academia al iniciar sesión.
      </p>
      <div className="flex justify-end pt-1">
        <Button
          disabled={!dirty || !form.name.trim() || form.max_active_students < 1 || update.isPending}
          onClick={save}
        >
          {update.isPending ? "Guardando…" : "Guardar cambios"}
        </Button>
      </div>
    </div>
  );
}

function TenantAdmins({ tenant }: { tenant: Tenant }) {
  const { data: admins = [], isLoading } = useTenantAdmins(tenant.id);
  const [adding, setAdding] = useState(false);

  if (isLoading) return <SkeletonRows rows={2} />;

  return (
    <div className="space-y-4">
      {admins.length === 0 ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Esta academia no tiene administrador. Crea uno para que alguien pueda entrar a gestionarla.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
          {admins.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">{a.full_name}</p>
                <p className="truncate text-xs text-slate-500">{a.email}</p>
              </div>
              {!a.is_active && <Badge color="slate">Desactivado</Badge>}
            </li>
          ))}
        </ul>
      )}

      {adding || admins.length === 0 ? (
        <div className="rounded-xl border border-slate-200 p-4">
          <SectionHeading>Nuevo administrador</SectionHeading>
          <AdminForm
            tenant={tenant}
            submitLabel="Crear administrador"
            secondary={
              admins.length > 0 ? (
                <Button variant="secondary" onClick={() => setAdding(false)}>
                  Cancelar
                </Button>
              ) : null
            }
            onDone={() => setAdding(false)}
          />
        </div>
      ) : (
        <Button variant="secondary" onClick={() => setAdding(true)}>
          Añadir administrador
        </Button>
      )}
    </div>
  );
}

function AdminForm({
  tenant,
  submitLabel,
  secondary,
  onDone,
}: {
  tenant: Tenant;
  submitLabel: string;
  secondary?: React.ReactNode;
  onDone: () => void;
}) {
  const create = useCreateTenantAdmin();
  const [form, setForm] = useState({ full_name: "", email: "", cui_passport: "", password: "" });
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const canSubmit =
    form.full_name.trim() &&
    /\S+@\S+\.\S+/.test(form.email) &&
    form.cui_passport.trim() &&
    form.password.length >= 8 &&
    !create.isPending;

  function submit() {
    create.mutate(
      {
        tenant_id: tenant.id,
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        cui_passport: form.cui_passport.trim(),
        password: form.password,
        // Que vea las horas de su academia, no UTC, desde el primer día.
        timezone: tenant.timezone,
      },
      {
        onSuccess: () => {
          notify("Administrador creado. Comparte la contraseña temporal con esa persona.", "success");
          onDone();
        },
        onError: onMutationError("No se pudo crear el administrador"),
      },
    );
  }

  return (
    <div className="space-y-3">
      <Field label="Nombre completo">
        <Input value={form.full_name} onChange={(e) => set({ full_name: e.target.value })} />
      </Field>
      <Field label="Correo">
        <Input
          type="email"
          autoComplete="off"
          value={form.email}
          onChange={(e) => set({ email: e.target.value })}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="DPI / CUI o pasaporte">
          <Input
            value={form.cui_passport}
            onChange={(e) => set({ cui_passport: e.target.value })}
          />
        </Field>
        <Field label="Contraseña temporal">
          <Input
            type="text"
            autoComplete="new-password"
            value={form.password}
            onChange={(e) => set({ password: e.target.value })}
          />
        </Field>
      </div>
      <p className="text-xs text-slate-500">
        Mínimo 8 caracteres. Podrá cambiarla en «Mi perfil» al entrar.
      </p>
      <div className="flex justify-end gap-2 pt-1">
        {secondary}
        <Button disabled={!canSubmit} onClick={submit}>
          {create.isPending ? "Creando…" : submitLabel}
        </Button>
      </div>
    </div>
  );
}

function TenantStatus({ tenant, onDone }: { tenant: Tenant; onDone: () => void }) {
  const update = useUpdateTenant();
  const [confirming, setConfirming] = useState(false);

  function setActive(is_active: boolean) {
    update.mutate(
      { id: tenant.id, is_active },
      {
        onSuccess: () => {
          notify(is_active ? "Academia reactivada" : "Academia suspendida", "success");
          onDone();
        },
        onError: onMutationError("No se pudo cambiar el estado"),
      },
    );
  }

  if (!tenant.is_active) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-600">
          Suspendida: nadie de esta academia puede iniciar sesión. Sus datos se conservan intactos.
        </p>
        <Button disabled={update.isPending} onClick={() => setActive(true)}>
          {update.isPending ? "Reactivando…" : "Reactivar academia"}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        Suspender corta el acceso de inmediato, también a quien tenga la sesión abierta. No se borra
        nada: al reactivarla todo sigue como estaba.
      </p>
      {confirming ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-semibold text-red-900">
            {tenant.active_users === 1
              ? "1 persona perderá el acceso ahora mismo."
              : `${tenant.active_users} personas perderán el acceso ahora mismo.`}
          </p>
          <p className="mt-0.5 text-xs text-red-800">
            Administradores, profesores y alumnos de {tenant.name}.
          </p>
          <div className="mt-3 flex gap-2">
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              Cancelar
            </Button>
            <Button variant="danger" disabled={update.isPending} onClick={() => setActive(false)}>
              {update.isPending ? "Suspendiendo…" : "Suspender academia"}
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="danger" onClick={() => setConfirming(true)}>
          Suspender academia
        </Button>
      )}
    </div>
  );
}

function TimezoneSelect({ value, onChange }: { value: string; onChange: (tz: string) => void }) {
  const options = TIMEZONES.includes(value) ? TIMEZONES : [value, ...TIMEZONES];
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((tz) => (
        <option key={tz} value={tz}>
          {tz.split("/").pop()?.replace(/_/g, " ")}
        </option>
      ))}
    </Select>
  );
}
