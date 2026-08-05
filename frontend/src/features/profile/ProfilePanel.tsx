import { useState } from "react";

import { useAuth } from "../../auth/AuthContext";
import {
  Badge, Button, Card, Field, Input, SectionHeading, Select,
} from "../../components/ui";
import { apiErrorMessage } from "../../lib/api";
import { PASSWORD_MIN_LENGTH } from "../../lib/constants";
import { useNationalities, useUpdateMe } from "../../lib/queries";
import { notify } from "../../lib/toast";
import { formatCuiPassport, formatPhoneNumber, validateCuiPassport } from "../../lib/validation";
import type { User } from "../../lib/types";

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  teacher: "Profesor",
  student: "Alumno",
};

function onMutationError(fallback: string) {
  return (e: unknown) => notify(apiErrorMessage(e, fallback), "error");
}

// Self-service profile editing, available to every role: your own name,
// timezone and password. Role, email and other admin-only fields are
// deliberately absent — those still go through /users.
export function ProfilePanel() {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <DetailsForm user={user} />
      <PasswordForm />
    </div>
  );
}

function DetailsForm({ user }: { user: User }) {
  const { updateUser } = useAuth();
  const update = useUpdateMe();
  const { data: nationalities = [] } = useNationalities();
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
        <Field label="CUI / DPI o Pasaporte" required={true} hint="Identificación personal principal (DPI o Pasaporte)">
          <Input
            value={cuiPassport}
            onChange={(e) => setCuiPassport(formatCuiPassport(e.target.value))}
            placeholder="Ej. 2450 12345 0101"
          />
        </Field>
        <Field label="Teléfono">
          <Input value={phone} onChange={(e) => setPhone(formatPhoneNumber(e.target.value))} placeholder="+502 5555-5555" />
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

function PasswordForm() {
  const update = useUpdateMe();
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
