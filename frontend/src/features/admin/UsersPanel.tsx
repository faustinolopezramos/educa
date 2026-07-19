import { useState } from "react";

import {
  Badge, Button, Card, ConfirmDialog, Field, Input, Modal, Select, Table, Td, Th,
} from "../../components/ui";
import { useCreateUser, useDeleteUser, useUpdateUser, useUsers } from "../../lib/queries";
import { notify } from "../../lib/toast";
import type { User } from "../../lib/types";
import { EMAIL_RE, PASSWORD_MIN_LENGTH, onMutationError } from "./shared";

const EMPTY_USER = {
  email: "",
  full_name: "",
  role: "student",
  password: "",
  timezone: "UTC",
};

export function UsersPanel() {
  const { data: users = [] } = useUsers();
  const create = useCreateUser();
  const del = useDeleteUser();
  const [form, setForm] = useState(EMPTY_USER);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<User | null>(null);
  const [toDelete, setToDelete] = useState<User | null>(null);

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!form.full_name.trim()) e.full_name = "Requerido";
    if (!EMAIL_RE.test(form.email)) e.email = "Correo no válido";
    if (form.password.length < PASSWORD_MIN_LENGTH)
      e.password = `Mínimo ${PASSWORD_MIN_LENGTH} caracteres`;
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function submit() {
    if (!validate()) return;
    create.mutate(form as never, {
      onSuccess: () => {
        setForm(EMPTY_USER);
        setErrors({});
        notify("Usuario creado", "success");
      },
      onError: onMutationError("No se pudo crear el usuario"),
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-1">
        <h3 className="mb-3 font-medium">Nuevo usuario</h3>
        <div className="space-y-3">
          <Field label="Nombre completo" error={errors.full_name}>
            <Input
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            />
          </Field>
          <Field label="Correo" error={errors.email}>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </Field>
          <Field label="Rol">
            <Select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
            >
              <option value="student">Alumno</option>
              <option value="teacher">Profesor</option>
              <option value="admin">Administrador</option>
            </Select>
          </Field>
          <Field label="Contraseña" error={errors.password}>
            <Input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </Field>
          <Button className="w-full" disabled={create.isPending} onClick={submit}>
            Crear usuario
          </Button>
        </div>
      </Card>
      <Card className="lg:col-span-2">
        <Table>
          <thead>
            <tr>
              <Th>Nombre</Th>
              <Th>Correo</Th>
              <Th>Rol</Th>
              <Th>Acciones</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((u) => (
              <tr key={u.id}>
                <Td>{u.full_name}</Td>
                <Td>{u.email}</Td>
                <Td>
                  <Badge color={u.role === "admin" ? "indigo" : "slate"}>
                    {u.role}
                  </Badge>
                </Td>
                <Td>
                  <div className="flex gap-1">
                    <Button variant="ghost" onClick={() => setEditing(u)}>
                      Editar
                    </Button>
                    <Button variant="ghost" onClick={() => setToDelete(u)}>
                      Eliminar
                    </Button>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      {editing && <EditUserModal user={editing} onClose={() => setEditing(null)} />}
      {toDelete && (
        <ConfirmDialog
          title="Eliminar usuario"
          message={
            <>
              ¿Eliminar a <strong>{toDelete.full_name}</strong>? Se borrarán también sus
              matrículas, calificaciones y asistencias.
            </>
          }
          busy={del.isPending}
          onClose={() => setToDelete(null)}
          onConfirm={() =>
            del.mutate(toDelete.id, {
              onSuccess: () => {
                setToDelete(null);
                notify("Usuario eliminado", "success");
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

function EditUserModal({ user, onClose }: { user: User; onClose: () => void }) {
  const update = useUpdateUser();
  const [form, setForm] = useState({
    full_name: user.full_name,
    email: user.email,
    role: user.role as string,
    timezone: user.timezone,
    max_weekly_hours: user.max_weekly_hours ?? ("" as number | ""),
    password: "",
  });

  function save() {
    if (!EMAIL_RE.test(form.email)) {
      notify("Correo no válido", "error");
      return;
    }
    if (form.password && form.password.length < PASSWORD_MIN_LENGTH) {
      notify(`La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres`, "error");
      return;
    }
    const patch: Record<string, unknown> = {
      id: user.id,
      full_name: form.full_name,
      email: form.email,
      role: form.role,
      timezone: form.timezone,
      max_weekly_hours: form.max_weekly_hours === "" ? null : Number(form.max_weekly_hours),
    };
    if (form.password) patch.password = form.password;
    update.mutate(patch as never, {
      onSuccess: () => {
        notify("Usuario actualizado", "success");
        onClose();
      },
      onError: onMutationError("No se pudo actualizar"),
    });
  }

  return (
    <Modal title="Editar usuario" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Nombre completo">
          <Input
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
          />
        </Field>
        <Field label="Correo">
          <Input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </Field>
        <Field label="Rol">
          <Select
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
          >
            <option value="student">Alumno</option>
            <option value="teacher">Profesor</option>
            <option value="admin">Administrador</option>
          </Select>
        </Field>
        {form.role === "teacher" && (
          <Field label="Máx. horas semanales (vacío = sin tope)">
            <Input
              type="number"
              min={1}
              value={form.max_weekly_hours}
              onChange={(e) =>
                setForm({
                  ...form,
                  max_weekly_hours: e.target.value === "" ? "" : Number(e.target.value),
                })
              }
            />
          </Field>
        )}
        <Field label="Nueva contraseña (opcional)">
          <Input
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={update.isPending} onClick={save}>
            Guardar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
