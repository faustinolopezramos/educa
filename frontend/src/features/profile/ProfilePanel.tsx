import { useEffect, useMemo, useState } from "react";

import { useAuth } from "../../auth/AuthContext";
import { IconClock, IconClose, IconPlus, IconGlobe, IconComputer, IconMobile, IconUserX, IconTrash } from "../../components/icons";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  InlineAlert,
  Input,
  Modal,
  ModalActions,
  SectionHeading,
  Select,
  SkeletonRows,
  TimePicker,
} from "../../components/ui";
import { api, apiErrorMessage } from "../../lib/api";
import { PASSWORD_MIN_LENGTH } from "../../lib/constants";
import { DAYS, dayName, formatTime } from "../../lib/format";
import {
  useAddAvailability,
  useDeleteAvailability,
  useLanguages,
  useNationalities,
  useSetTeacherLanguages,
  useTeacherAvailability,
  useTeacherLanguages,
  useTeacherLoad,
  useUpdateMe,
} from "../../lib/queries";
import {
  disablePush,
  enablePush,
  PushUnavailableError,
  useInstallPrompt,
  usePushState,
  type PushState,
} from "../../lib/push";
import { notify } from "../../lib/toast";
import type { User } from "../../lib/types";
import {
  formatCuiPassport,
  formatPhoneNumber,
  validateCuiPassport,
} from "../../lib/validation";

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  teacher: "Profesor",
  student: "Alumno",
};

function onMutationError(fallback: string) {
  return (e: unknown) => notify(apiErrorMessage(e, fallback), "error");
}

// Self-service profile editing, available to every role: your own name,
// timezone and password. Plus teacher self-service academic profile for teachers.
export function ProfilePanel() {
  const { user } = useAuth();
  if (!user) return null;

  const isTeacher = user.role === "teacher";

  return (
    <div className="space-y-6">
      <div className="max-w-3xl">
        <ProfileDetailsForm user={user} />
      </div>

      <div className="max-w-2xl">
        <NotificationChannelsForm user={user} />
      </div>

      <InstallAppCard />

      <div className="max-w-2xl">
        <PasswordForm />
      </div>

      {isTeacher && <AcademicProfileSection user={user} />}

      <div className="max-w-2xl">
        <DeviceSessionsPanel />
      </div>

      <div className="max-w-2xl">
        <PasskeysPanel />
      </div>
    </div>
  );
}

function ProfileDetailsForm({ user }: { user: User }) {
  const { updateUser } = useAuth();
  const update = useUpdateMe() ?? {};
  const { data: nationalities = [] } = useNationalities() ?? {};
  const [fullName, setFullName] = useState(user.full_name);
  const [timezone, setTimezone] = useState(user.timezone);
  const [phone, setPhone] = useState(user.phone ?? "");
  const [address, setAddress] = useState(user.address ?? "");
  const [cuiPassport, setCuiPassport] = useState(user.cui_passport ?? "");
  const [nationalityId, setNationalityId] = useState(user.nationality_id ?? 0);

  const dirty =
    fullName !== user.full_name ||
    timezone !== user.timezone ||
    phone !== (user.phone ?? "") ||
    address !== (user.address ?? "") ||
    cuiPassport !== (user.cui_passport ?? "") ||
    nationalityId !== (user.nationality_id ?? 0);

  function save() {
    if (!fullName.trim()) {
      notify("El nombre no puede estar vacío", "error");
      return;
    }
    if (cuiPassport.trim()) {
      const cuiVal = validateCuiPassport(cuiPassport);
      if (!cuiVal.isValid && cuiVal.error) {
        notify(cuiVal.error, "error");
        return;
      }
    }
    update.mutate(
      {
        full_name: fullName.trim(),
        timezone: timezone.trim() || "UTC",
        phone: phone.trim() || null,
        address: address.trim() || null,
        cui_passport: cuiPassport.trim() || null,
        nationality_id: nationalityId || null,
      },
      {
        onSuccess: (fresh) => {
          updateUser(fresh);
          notify("Perfil actualizado", "success");
        },
        onError: onMutationError("No se pudo actualizar el perfil"),
      },
    );
  }

  return (
    <Card>
      <SectionHeading>Datos personales</SectionHeading>
      <div className="space-y-3">
        <Field label="Correo">
          <Input value={user.email} disabled className="opacity-60" />
        </Field>
        <Field label="Rol">
          <div>
            <Badge color={user.role === "admin" ? "indigo" : "slate"}>
              {ROLE_LABELS[user.role] ?? user.role}
            </Badge>
          </div>
        </Field>
        <Field label="Nombre completo" required={true}>
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </Field>
        <Field
          label="CUI / DPI o Pasaporte"
          required={true}
          hint="Identificación personal principal (DPI o Pasaporte)"
        >
          <Input
            value={cuiPassport}
            onChange={(e) => setCuiPassport(formatCuiPassport(e.target.value))}
            placeholder="Ej. 2450 12345 0101"
          />
        </Field>
        <Field label="Teléfono">
          <Input
            value={phone}
            onChange={(e) => setPhone(formatPhoneNumber(e.target.value))}
            placeholder="+502 5555-5555"
          />
        </Field>
        <Field label="Dirección">
          <Input value={address} onChange={(e) => setAddress(e.target.value)} />
        </Field>
        <Field label="Nacionalidad">
          <Select
            value={nationalityId}
            onChange={(e) => setNationalityId(Number(e.target.value))}
          >
            <option value={0}>Sin especificar</option>
            {nationalities.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Zona horaria">
          <Input
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            placeholder="Ej. America/Mexico_City"
          />
        </Field>
        <Button disabled={!dirty || update.isPending} onClick={save}>
          Guardar cambios
        </Button>
      </div>
    </Card>
  );
}

/**
 * Por dónde llegan los avisos (clase cancelada, reprogramada…) además de la
 * campana. Cada casilla se guarda al marcarla: son dos interruptores, no un
 * formulario que haya que acordarse de enviar.
 */
function NotificationChannelsForm({ user }: { user: User }) {
  const { updateUser } = useAuth();
  const update = useUpdateMe() ?? {};

  function toggle(field: "notify_email" | "notify_whatsapp", value: boolean) {
    update.mutate(
      { [field]: value },
      {
        onSuccess: (fresh) => {
          updateUser(fresh);
          notify("Preferencia guardada", "success");
        },
        onError: onMutationError("No se pudo guardar la preferencia"),
      },
    );
  }

  const channels = [
    {
      field: "notify_email" as const,
      label: "Correo electrónico",
      detail: user.email,
      disabledReason: null,
    },
    {
      field: "notify_whatsapp" as const,
      label: "WhatsApp",
      detail: user.phone || "Sin teléfono",
      disabledReason: user.phone ? null : "Agrega tu teléfono arriba para activarlo",
    },
  ];

  return (
    <Card>
      <SectionHeading>Avisos</SectionHeading>
      <p className="text-sm text-slate-500 mb-3">
        Si se cancela o se mueve una de tus clases, te avisamos aquí en la campana y,
        además, por los canales que marques.
      </p>
      <div className="space-y-2">
        {channels.map((c) => (
          <label
            key={c.field}
            className={`flex items-start gap-2.5 rounded-lg border border-slate-200 p-3 text-sm ${
              c.disabledReason ? "opacity-60" : "cursor-pointer hover:bg-slate-50"
            }`}
          >
            <input
              type="checkbox"
              className="mt-0.5 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              checked={user[c.field]}
              disabled={!!c.disabledReason || update.isPending}
              onChange={(e) => toggle(c.field, e.target.checked)}
            />
            <span>
              <span className="font-medium text-slate-800">{c.label}</span>
              <span className="block text-xs text-slate-500">
                {c.disabledReason ?? c.detail}
              </span>
            </span>
          </label>
        ))}
        <DevicePushRow />
      </div>
    </Card>
  );
}

const PUSH_DETAIL: Record<PushState, string> = {
  on: "Activados en este dispositivo",
  off: "Te avisamos aunque no tengas Educa abierta",
  denied: "Los bloqueaste: actívalos en los ajustes del navegador para este sitio",
  "needs-install": "En iPhone, primero instala la app (abajo) y actívalos desde ella",
  unsupported: "Este navegador no admite avisos",
};

/**
 * Avisos push en *este* dispositivo. A diferencia del correo y WhatsApp, no es
 * una preferencia de la cuenta: cada teléfono u ordenador se activa por su
 * lado, y el permiso que pide el navegador es el consentimiento.
 */
function DevicePushRow() {
  const [state, setState] = usePushState();
  const [busy, setBusy] = useState(false);
  if (state === null) return null;
  const actionable = state === "on" || state === "off";

  async function toggle(on: boolean) {
    setBusy(true);
    try {
      const next = on ? await enablePush() : await disablePush();
      setState(next);
      if (on && next === "on") notify("Avisos activados en este dispositivo", "success");
      if (on && next === "denied") notify("El navegador bloqueó los avisos", "error");
    } catch (e) {
      notify(
        e instanceof PushUnavailableError
          ? e.message
          : apiErrorMessage(e, "No se pudieron activar los avisos"),
        "error",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <label
      className={`flex items-start gap-2.5 rounded-lg border border-slate-200 p-3 text-sm ${
        actionable ? "cursor-pointer hover:bg-slate-50" : "opacity-60"
      }`}
    >
      <input
        type="checkbox"
        className="mt-0.5 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
        checked={state === "on"}
        disabled={!actionable || busy}
        onChange={(e) => void toggle(e.target.checked)}
      />
      <span>
        <span className="font-medium text-slate-800">Avisos en este dispositivo</span>
        <span className="block text-xs text-slate-500">{PUSH_DETAIL[state]}</span>
      </span>
    </label>
  );
}

/**
 * Instalar Educa como app: un icono en la pantalla de inicio que se abre sin
 * la barra del navegador. En Android/Chrome hay botón; en iPhone sólo se puede
 * explicar el paso, porque Safari no deja que una web lo ofrezca.
 */
function InstallAppCard() {
  const { installed, canPrompt, iosManual, install } = useInstallPrompt();
  if (installed || (!canPrompt && !iosManual)) return null;
  return (
    <div className="max-w-2xl">
      <Card>
        <SectionHeading>Instalar Educa</SectionHeading>
        <p className="mb-3 text-sm text-slate-500">
          Tenla en la pantalla de inicio como una app más: se abre directa en tus clases.
        </p>
        {canPrompt ? (
          <Button
            onClick={() =>
              void install().then((ok) => ok && notify("Educa quedó instalada", "success"))
            }
          >
            Instalar la app
          </Button>
        ) : (
          <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-700">
            <li>
              Toca <strong>Compartir</strong> (el cuadrado con la flecha hacia arriba) en la barra
              de Safari.
            </li>
            <li>
              Elige <strong>Añadir a pantalla de inicio</strong>.
            </li>
            <li>Abre Educa desde el icono nuevo y activa aquí los avisos.</li>
          </ol>
        )}
      </Card>
    </div>
  );
}

function PasswordForm() {
  const update = useUpdateMe() ?? {};
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    if (!currentPassword) {
      setError("Ingresa tu contraseña actual");
      return;
    }
    if (newPassword.length < PASSWORD_MIN_LENGTH) {
      setError(`La nueva contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres`);
      return;
    }
    if (newPassword !== confirm) {
      setError("Las contraseñas no coinciden");
      return;
    }
    update.mutate(
      { current_password: currentPassword, password: newPassword },
      {
        onSuccess: () => {
          setCurrentPassword("");
          setNewPassword("");
          setConfirm("");
          notify("Contraseña actualizada", "success");
        },
        onError: (e) => setError(apiErrorMessage(e, "No se pudo cambiar la contraseña")),
      },
    );
  }

  return (
    <Card>
      <SectionHeading>Cambiar contraseña</SectionHeading>
      <div className="space-y-3">
        <Field label="Contraseña actual">
          <Input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
        </Field>
        <Field label="Nueva contraseña">
          <Input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
        </Field>
        <Field label="Confirmar nueva contraseña" error={error}>
          <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        <Button disabled={update.isPending} onClick={submit}>
          Actualizar contraseña
        </Button>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ *
 * Teacher Self-Service: Academic Profile (Languages & Availability)
 * ------------------------------------------------------------------ */

function AcademicProfileSection({ user }: { user: User }) {
  if (user.role !== "teacher") return null;

  return (
    <div className="space-y-6">
      <TeacherWeeklyLoadCard user={user} />

      <div className="grid gap-6 lg:grid-cols-2">
        <TeacherLanguagesForm user={user} />
        <TeacherAvailabilityForm user={user} />
      </div>
    </div>
  );
}

function TeacherWeeklyLoadCard({ user }: { user: User }) {
  const { data: load, isLoading } = useTeacherLoad(user.id) ?? {};

  if (isLoading || !load) {
    return <SkeletonRows rows={1} />;
  }

  const { assigned_hours, max_hours, percentage } = load;

  return (
    <Card padding="md">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="text-2xs font-bold uppercase tracking-wider text-slate-500">
            Carga Académica Semanal
          </span>
          <h4 className="text-base font-bold text-slate-900 mt-0.5">
            {assigned_hours}h asignadas de {max_hours}h máximas
          </h4>
        </div>
        <Badge color={percentage >= 100 ? "red" : percentage > 75 ? "amber" : "green"}>
          {percentage}% ocupación
        </Badge>
      </div>

      <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden mt-3">
        <div
          className={`h-2 rounded-full transition-all duration-300 ${
            percentage >= 100
              ? "bg-red-500"
              : percentage > 75
              ? "bg-amber-500"
              : "bg-emerald-500"
          }`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
    </Card>
  );
}

function TeacherLanguagesForm({ user }: { user: User }) {
  const { data: teacherLangs = [], isLoading: loadingLangs } = useTeacherLanguages(user.id) ?? {};
  const { data: allLanguages = [], isLoading: loadingAll } = useLanguages() ?? {};
  const setLanguages = useSetTeacherLanguages() ?? {};
  const [selectedLangId, setSelectedLangId] = useState<number>(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const currentLangIds = useMemo(
    () => (teacherLangs || []).map((tl) => tl.language_id),
    [teacherLangs],
  );

  const availableToAdd = useMemo(
    () => (allLanguages || []).filter((l) => !currentLangIds.includes(l.id)),
    [allLanguages, currentLangIds],
  );

  function handleAdd() {
    if (!selectedLangId) return;
    setErrorMsg(null);
    const nextIds = [...currentLangIds, selectedLangId];
    setLanguages.mutate(
      { teacherId: user.id, language_ids: nextIds },
      {
        onSuccess: () => {
          setSelectedLangId(0);
          setErrorMsg(null);
          notify("Idioma cualificado agregado correctamente", "success");
        },
        onError: (e) => {
          const msg = apiErrorMessage(e, "No se pudo agregar el idioma");
          setErrorMsg(msg);
          notify(msg, "error");
        },
      },
    );
  }

  function handleRemove(langIdToRemove: number) {
    setErrorMsg(null);
    const nextIds = currentLangIds.filter((id) => id !== langIdToRemove);
    setLanguages.mutate(
      { teacherId: user.id, language_ids: nextIds },
      {
        onSuccess: () => {
          setErrorMsg(null);
          notify("Idioma eliminado correctamente", "success");
        },
        onError: (e) => {
          const msg = apiErrorMessage(e, "No se pudo eliminar el idioma");
          setErrorMsg(msg);
          notify(msg, "error");
        },
      },
    );
  }

  return (
    <Card>
      <SectionHeading>Gestión de Idiomas</SectionHeading>
      <p className="mb-4 text-xs text-slate-500">
        Idiomas y materias que estás cualificado para impartir:
      </p>

      {errorMsg && (
        <div className="mb-4">
          <InlineAlert type="error">{errorMsg}</InlineAlert>
        </div>
      )}

      {loadingLangs || loadingAll ? (
        <SkeletonRows rows={2} />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {teacherLangs.length === 0 ? (
              <span className="text-xs italic text-slate-500">
                No tienes idiomas o materias asignadas.
              </span>
            ) : (
              teacherLangs.map((tl) => {
                const lang = allLanguages.find((l) => l.id === tl.language_id);
                const name = lang ? lang.name : `#${tl.language_id}`;
                return (
                  <span
                    key={tl.id}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-800"
                  >
                    {name}
                    <button
                      type="button"
                      disabled={setLanguages.isPending}
                      onClick={() => handleRemove(tl.language_id)}
                      className="rounded-md p-0.5 text-brand-600 transition-colors hover:bg-brand-100 hover:text-brand-900 focus:outline-none"
                      title="Eliminar idioma"
                    >
                      <IconClose className="h-3.5 w-3.5" />
                    </button>
                  </span>
                );
              })
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
            <Select
              className="flex-1 min-w-[12rem]"
              value={selectedLangId}
              onChange={(e) => setSelectedLangId(Number(e.target.value))}
            >
              <option value={0}>Selecciona un idioma para agregar…</option>
              {availableToAdd.map((lang) => (
                <option key={lang.id} value={lang.id}>
                  {lang.name}
                </option>
              ))}
            </Select>
            <Button
              size="sm"
              disabled={!selectedLangId || setLanguages.isPending}
              onClick={handleAdd}
            >
              <IconPlus className="h-4 w-4" />
              <span>{setLanguages.isPending ? "Guardando…" : "Agregar"}</span>
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function TeacherAvailabilityForm({ user }: { user: User }) {
  const { data: availability = [], isLoading } = useTeacherAvailability(user.id) ?? {};
  const addAvail = useAddAvailability() ?? {};
  const deleteAvail = useDeleteAvailability() ?? {};

  const [dayOfWeek, setDayOfWeek] = useState<number>(0);
  const [startTime, setStartTime] = useState<string>("08:00");
  const [endTime, setEndTime] = useState<string>("12:00");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  function handleAdd() {
    setErrorMsg(null);
    if (startTime >= endTime) {
      const msg = "La hora de inicio debe ser anterior a la hora de fin";
      setErrorMsg(msg);
      notify(msg, "error");
      return;
    }
    addAvail.mutate(
      {
        teacherId: user.id,
        day_of_week: dayOfWeek,
        start_time: startTime,
        end_time: endTime,
      },
      {
        onSuccess: () => {
          setErrorMsg(null);
          notify("Disponibilidad añadida correctamente", "success");
        },
        onError: (e) => {
          const msg = apiErrorMessage(e, "No se pudo agregar la disponibilidad");
          setErrorMsg(msg);
          notify(msg, "error");
        },
      },
    );
  }

  function handleDelete(id: number) {
    setErrorMsg(null);
    deleteAvail.mutate(
      { teacherId: user.id, id },
      {
        onSuccess: () => {
          setErrorMsg(null);
          notify("Horario de disponibilidad eliminado", "success");
        },
        onError: (e) => {
          const msg = apiErrorMessage(e, "No se pudo eliminar el horario");
          setErrorMsg(msg);
          notify(msg, "error");
        },
      },
    );
  }

  const sortedAvail = useMemo(() => {
    return [...availability].sort(
      (a, b) => a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time),
    );
  }, [availability]);

  return (
    <Card>
      <SectionHeading>Gestión de Disponibilidad</SectionHeading>
      <p className="mb-4 text-xs text-slate-500">
        Ventanas de horario en las que puedes impartir clases durante la semana:
      </p>

      {errorMsg && (
        <div className="mb-4">
          <InlineAlert type="error">{errorMsg}</InlineAlert>
        </div>
      )}

      {isLoading ? (
        <SkeletonRows rows={3} />
      ) : (
        <div className="space-y-4">
          {sortedAvail.length === 0 ? (
            <EmptyState
              icon={<IconClock className="h-5 w-5" />}
              title="Sin horarios registrados"
              message="Agrega tus ventanas de disponibilidad para que la administración te asigne cursos adecuadamente."
            />
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {sortedAvail.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <Badge color="indigo">{dayName(item.day_of_week)}</Badge>
                    <span className="font-mono text-slate-700">
                      {formatTime(item.start_time)} – {formatTime(item.end_time)}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={deleteAvail.isPending}
                    onClick={() => handleDelete(item.id)}
                    title="Eliminar disponibilidad"
                    className="text-red-600 hover:bg-red-50 hover:text-red-700"
                  >
                    <IconClose className="h-3.5 w-3.5" />
                    <span>Eliminar</span>
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
            <div className="mb-2 text-xs font-semibold text-slate-700">
              Agregar ventana de disponibilidad
            </div>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-2xs font-medium text-slate-500">Día</label>
                <Select
                  value={dayOfWeek}
                  onChange={(e) => setDayOfWeek(Number(e.target.value))}
                >
                  {DAYS.map((name, index) => (
                    <option key={index} value={index}>
                      {name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-2xs font-medium text-slate-500">Hora Inicio</label>
                <TimePicker value={startTime} onChange={setStartTime} />
              </div>
              <div>
                <label className="mb-1 block text-2xs font-medium text-slate-500">Hora Fin</label>
                <TimePicker value={endTime} onChange={setEndTime} />
              </div>
            </div>
            <div className="mt-3 flex justify-end">
              <Button size="sm" disabled={addAvail.isPending} onClick={handleAdd}>
                <IconPlus className="h-4 w-4" />
                <span>{addAvail.isPending ? "Guardando…" : "Agregar disponibilidad"}</span>
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}


/* ------------------------------------------------------------------ *
 * Device Sessions Panel
 * ------------------------------------------------------------------ */

interface DeviceSession {
  id: number;
  device_name: string | null;
  ip_address: string | null;
  location: string | null;
  created_at: string;
  last_used_at: string;
  is_current: boolean;
}

interface DeviceSessionListResponse {
  sessions: DeviceSession[];
}

function DeviceSessionsPanel() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<DeviceSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<number | null>(null);

  // Cargar sesiones al montar
  useEffect(() => {
    if (user) loadSessions();
  }, []);

  if (!user) return null;

  async function loadSessions() {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<DeviceSessionListResponse>("/auth/device-sessions");
      setSessions(data.sessions);
    } catch (e) {
      setError("No se pudieron cargar las sesiones activas");
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function revokeSession(sessionId: number, isCurrent: boolean) {
    if (isCurrent) {
      setError("No puedes revocar tu sesión actual desde aquí. Usa 'Cerrar sesión' en el menú.");
      return;
    }
    setRevoking(sessionId);
    try {
      await api.post("/auth/device-sessions/revoke", { session_id: sessionId });
      await loadSessions();
    } catch (e) {
      setError("No se pudo revocar la sesión");
      console.error(e);
    } finally {
      setRevoking(null);
    }
  }

  async function revokeAllOther() {
    if (!confirm("Esto cerrará la sesión en todos los demás dispositivos. ¿Continuar?")) return;
    try {
      await api.post("/auth/device-sessions/revoke-all-other");
      await loadSessions();
    } catch (e) {
      setError("No se pudieron revocar las sesiones");
      console.error(e);
    }
  }

  function getDeviceIcon(deviceName: string | null) {
    if (!deviceName) return <IconComputer className="h-4 w-4" />;
    const name = deviceName.toLowerCase();
    if (name.includes("mobile") || name.includes("iphone") || name.includes("android")) {
      return <IconMobile className="h-4 w-4" />;
    }
    if (name.includes("safari") || name.includes("chrome") || name.includes("firefox") || name.includes("edge")) {
      return <IconComputer className="h-4 w-4" />;
    }
    return <IconGlobe className="h-4 w-4" />;
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleString("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return (
    <Card>
      <SectionHeading>Sesiones activas</SectionHeading>
      <p className="text-sm text-slate-500 mb-4">
        Dispositivos donde has iniciado sesión. Puedes cerrar sesiones que no reconozcas.
      </p>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="h-10 w-10 rounded-lg bg-slate-200" />
              <div className="flex-1 space-y-1">
                <div className="h-4 w-3/4 bg-slate-200 rounded" />
                <div className="h-3 w-1/2 bg-slate-200 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : sessions.length === 0 ? (
        <p className="text-sm text-slate-500 text-center py-4">No hay sesiones activas</p>
      ) : (
        <div className="space-y-2">
          {sessions.map((session) => (
            <div
              key={session.id}
              className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 ${
                session.is_current
                  ? "border-brand-300 bg-brand-50"
                  : "border-slate-200 bg-white"
              }`}
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="flex-shrink-0 flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                  {getDeviceIcon(session.device_name)}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-medium text-slate-800 truncate">
                    {session.device_name || "Dispositivo desconocido"}
                    {session.is_current && (
                      <span className="flex-shrink-0 rounded-full bg-brand-100 px-2 py-0.5 text-2xs font-semibold text-brand-700">
                        Actual
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-2xs text-slate-500 truncate">
                    {session.ip_address && <span>{session.ip_address}</span>}
                    {session.location && <span>• {session.location}</span>}
                    <span>• Iniciada: {formatDate(session.created_at)}</span>
                    <span>• Última actividad: {formatDate(session.last_used_at)}</span>
                  </div>
                </div>
              </div>
              {!session.is_current && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={revoking === session.id}
                  onClick={() => revokeSession(session.id, session.is_current)}
                  className="text-red-600 hover:bg-red-50 hover:text-red-700"
                  title="Cerrar esta sesión"
                >
{revoking === session.id ? (
                    <span className="animate-spin">⏳</span>
                  ) : (
                    <IconTrash className="h-4 w-4" />
                  )}
                </Button>
              )}
            </div>
          ))}

          {sessions.some((s) => !s.is_current) && (
            <div className="pt-2 border-t border-slate-100">
              <Button
                variant="ghost"
                size="sm"
                onClick={revokeAllOther}
                className="text-red-600 hover:bg-red-50 hover:text-red-700"
              >
                <IconUserX className="h-4 w-4" />
                Cerrar todas las demás sesiones
              </Button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}


/* ------------------------------------------------------------------ *
 * Passkeys Panel (WebAuthn)
 * ------------------------------------------------------------------ */

interface WebAuthnCredential {
  id: number;
  name: string | null;
  authenticator_type: string | null;
  transports: string | null;
  created_at: string;
  last_used_at: string | null;
}

interface WebAuthnCredentialListResponse {
  credentials: WebAuthnCredential[];
}

function PasskeysPanel() {
  const { user } = useAuth();
  const [credentials, setCredentials] = useState<WebAuthnCredential[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);
  // Registrar una passkey toca la seguridad de la cuenta: se confirma con la
  // contraseña (y el código del autenticador, si la cuenta lo tiene).
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState("");
  const [mfaToken, setMfaToken] = useState("");
  const [needsMfa, setNeedsMfa] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  function openConfirm() {
    setPassword("");
    setMfaToken("");
    setNeedsMfa(false);
    setConfirmError(null);
    setRegisterError(null);
    setConfirming(true);
  }

  // Cargar credenciales al montar
  useEffect(() => {
    if (user) loadCredentials();
  }, []);

  if (!user) return null;

  async function loadCredentials() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<WebAuthnCredentialListResponse>("/auth/webauthn/credentials");
      setCredentials(res.data.credentials);
    } catch (e) {
      setError("No se pudieron cargar las passkeys");
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function startRegistration() {
    setRegistering(true);
    setRegisterError(null);
    setConfirmError(null);
    try {
      // 1. Obtener opciones de registro (confirmando antes la identidad)
      let startRes: { options: string };
      try {
        const res = await api.post<{ options: string }>("/auth/webauthn/register/start", {
          password,
          mfa_token: mfaToken.trim() || undefined,
        });
        startRes = res.data;
      } catch (e) {
        const detail = (e as { response?: { data?: { detail?: { code?: string } } } })?.response
          ?.data?.detail;
        if (detail && typeof detail === "object" && detail.code === "mfa_token_required") {
          setNeedsMfa(true);
        }
        setConfirmError(apiErrorMessage(e, "No se pudo confirmar tu identidad"));
        return;
      }
      setConfirming(false);
      setPassword("");
      setMfaToken("");
      const options = JSON.parse(startRes.options);

      // 2. Pedir al navegador que cree la credencial
      const credential = await navigator.credentials.create({ publicKey: options });

      if (!credential) {
        throw new Error("No se pudo crear la credencial (cancelado por el usuario)");
      }

      // TypeScript: credential es PublicKeyCredential después del check
      const pkCredential = credential as PublicKeyCredential;
      const attestationResponse = pkCredential.response as AuthenticatorAttestationResponse;

      // 3. Enviar credencial al servidor
      const credentialData = {
        id: pkCredential.id,
        rawId: arrayBufferToBase64URL(pkCredential.rawId),
        response: {
          attestationObject: arrayBufferToBase64URL(attestationResponse.attestationObject),
          clientDataJSON: arrayBufferToBase64URL(attestationResponse.clientDataJSON),
          transports: attestationResponse.getTransports ? attestationResponse.getTransports() : [],
        },
        type: pkCredential.type,
      };

      await api.post("/auth/webauthn/register/finish", {
        credential: credentialData,
        challenge: options.challenge,
      });

      await loadCredentials();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Error al registrar passkey";
      setRegisterError(msg);
      console.error(e);
    } finally {
      setRegistering(false);
    }
  }

  async function deleteCredential(credentialId: number) {
    if (!confirm("¿Eliminar esta passkey? No podrás usarla para iniciar sesión.")) return;
    try {
      await api.delete(`/auth/webauthn/credentials/${credentialId}`);
      await loadCredentials();
    } catch (e) {
      setError("No se pudo eliminar la passkey");
      console.error(e);
    }
  }

  function arrayBufferToBase64URL(buffer: ArrayBuffer) {
    return btoa(String.fromCharCode(...new Uint8Array(buffer)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "");
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleString("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  const isSupported =
    typeof window !== "undefined" &&
    "credentials" in navigator &&
    "create" in navigator.credentials &&
    "get" in navigator.credentials;

  return (
    <Card>
      <SectionHeading>Passkeys (Passkeys / WebAuthn)</SectionHeading>
      <p className="text-sm text-slate-500 mb-4">
        Las passkeys te permiten iniciar sesión sin contraseña usando Face ID, Touch ID,
        Windows Hello, llaves de seguridad USB/NFC o el gestor de contraseñas de tu navegador.
      </p>

      {!isSupported && (
        <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-sm">
          Tu navegador no soporta WebAuthn. Actualiza a una versión reciente de Chrome, Firefox,
          Safari o Edge para usar passkeys.
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}

      {registerError && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
          {registerError}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Button
          onClick={openConfirm}
          disabled={registering || !isSupported || loading}
          className={isSupported ? "" : "opacity-50 cursor-not-allowed"}
        >
          {registering ? (
            <>
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Registrando…
            </>
          ) : (
            <>
              <svg className="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Registrar nueva passkey
            </>
          )}
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="animate-pulse flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="h-10 w-10 rounded-lg bg-slate-200" />
              <div className="flex-1 space-y-1">
                <div className="h-4 w-3/4 bg-slate-200 rounded" />
                <div className="h-3 w-1/2 bg-slate-200 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : credentials.length === 0 ? (
        <p className="text-sm text-slate-500 text-center py-4">
          No tienes passkeys registradas. Haz clic en "Registrar nueva passkey" para empezar.
        </p>
      ) : (
        <div className="space-y-2">
          {credentials.map((cred) => (
            <div
              key={cred.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2"
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="flex-shrink-0 flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-medium text-slate-800 truncate">
                    {cred.name || "Passkey"}
                    {cred.authenticator_type && (
                      <span className="flex-shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-2xs font-semibold text-slate-600">
                        {cred.authenticator_type}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-2xs text-slate-500 truncate">
                    {cred.transports && <span>{cred.transports}</span>}
                    <span>• Registrada: {formatDate(cred.created_at)}</span>
                    {cred.last_used_at && <span>• Último uso: {formatDate(cred.last_used_at)}</span>}
                  </div>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => deleteCredential(cred.id)}
                className="text-red-600 hover:bg-red-50 hover:text-red-700"
                title="Eliminar passkey"
              >
                <IconTrash className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {confirming && (
        <Modal
          title="Confirma tu identidad"
          description="Una passkey permite entrar sin contraseña, así que antes de añadirla hay que comprobar que eres tú."
          onClose={() => !registering && setConfirming(false)}
          maxWidth="max-w-sm"
          onSubmit={() => {
            if (password && !registering) void startRegistration();
          }}
          footer={
            <ModalActions>
              <Button
                type="button"
                variant="secondary"
                disabled={registering}
                onClick={() => setConfirming(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={registering || !password}>
                {registering ? "Comprobando…" : "Continuar"}
              </Button>
            </ModalActions>
          }
        >
          <div className="space-y-3">
            <Field label="Contraseña actual" error={needsMfa ? null : confirmError}>
              <Input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            {needsMfa && (
              <Field
                label="Código de verificación"
                hint="El de tu app autenticadora, o un código de respaldo."
                error={confirmError}
              >
                <Input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={8}
                  value={mfaToken}
                  onChange={(e) => setMfaToken(e.target.value)}
                />
              </Field>
            )}
          </div>
        </Modal>
      )}
    </Card>
  );
}
