import { useMemo, useState } from "react";

import { useAuth } from "../../auth/AuthContext";
import { IconClock, IconClose, IconPlus } from "../../components/icons";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  InlineAlert,
  Input,
  SectionHeading,
  Select,
  SkeletonRows,
  TimePicker,
} from "../../components/ui";
import { apiErrorMessage } from "../../lib/api";
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

      <div className="max-w-2xl">
        <PasswordForm />
      </div>

      {isTeacher && <AcademicProfileSection user={user} />}
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
      </div>
    </Card>
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
              <span className="text-xs italic text-slate-400">
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
