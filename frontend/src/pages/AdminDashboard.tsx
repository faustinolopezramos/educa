import { useState } from "react";

import { Tabs } from "../components/Tabs";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Field,
  Input,
  Modal,
  PageTitle,
  Select,
  Table,
  Td,
  Th,
} from "../components/ui";
import { EnrollWizard } from "../features/enrollments/EnrollWizard";
import { SchedulePlanner } from "../features/schedules/SchedulePlanner";
import { apiErrorMessage } from "../lib/api";
import { DAYS, formatTime } from "../lib/format";
import { notify } from "../lib/toast";
import {
  useAddAvailability,
  useCourses,
  useCreateCourse,
  useCreateLanguage,
  useCreateLevel,
  useCreateRoom,
  useCreateUser,
  useDeleteAvailability,
  useDeleteCourse,
  useDeleteLanguage,
  useDeleteLevel,
  useDeleteRoom,
  useDeleteUser,
  useEnrollments,
  useLanguages,
  useLevels,
  useRooms,
  useSetTeacherLanguages,
  useTeacherAvailability,
  useTeacherLanguages,
  useUpdateCourse,
  useUpdateRoom,
  useUpdateUser,
  useUsers,
} from "../lib/queries";
import type { Course, Room, User } from "../lib/types";

// Surfaces a mutation error as a toast, extracting the FastAPI detail.
function onMutationError(fallback: string) {
  return (e: unknown) => notify(apiErrorMessage(e, fallback), "error");
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function AdminDashboard() {
  return (
    <div>
      <PageTitle>Panel de Administración</PageTitle>
      <Tabs
        tabs={[
          { id: "users", label: "Usuarios", content: <UsersPanel /> },
          { id: "catalog", label: "Catálogo", content: <CatalogPanel /> },
          { id: "courses", label: "Cursos", content: <CoursesPanel /> },
          { id: "rooms", label: "Aulas", content: <RoomsPanel /> },
          { id: "teachers", label: "Profesores", content: <TeachersPanel /> },
          { id: "schedules", label: "Horarios", content: <SchedulesPanel /> },
          { id: "enrollments", label: "Matrículas", content: <EnrollmentsPanel /> },
        ]}
      />
    </div>
  );
}

// ---------------- Users ----------------
const EMPTY_USER = {
  email: "",
  full_name: "",
  role: "student",
  password: "",
  timezone: "UTC",
};

function UsersPanel() {
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
    if (form.password.length < 6) e.password = "Mínimo 6 caracteres";
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

// ---------------- Catalog (languages + levels) ----------------
function CatalogPanel() {
  const { data: languages = [] } = useLanguages();
  const { data: levels = [] } = useLevels();
  const createLang = useCreateLanguage();
  const delLang = useDeleteLanguage();
  const createLevel = useCreateLevel();
  const delLevel = useDeleteLevel();
  const [langName, setLangName] = useState("");
  const [level, setLevel] = useState({ language_id: 0, code: "", name: "" });

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <h3 className="mb-3 font-medium">Idiomas</h3>
        <div className="mb-4 flex gap-2">
          <Input
            placeholder="Ej. Inglés"
            value={langName}
            onChange={(e) => setLangName(e.target.value)}
          />
          <Button
            onClick={() =>
              langName &&
              createLang.mutate(langName, {
                onSuccess: () => setLangName(""),
                onError: onMutationError("No se pudo crear el idioma"),
              })
            }
          >
            Añadir
          </Button>
        </div>
        <ul className="space-y-1 text-sm">
          {languages.map((l) => (
            <li
              key={l.id}
              className="flex items-center justify-between rounded bg-slate-50 px-3 py-1.5"
            >
              {l.name}
              <Button
                variant="ghost"
                onClick={() =>
                  delLang.mutate(l.id, {
                    onError: onMutationError("No se pudo eliminar (¿tiene niveles?)"),
                  })
                }
              >
                ✕
              </Button>
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <h3 className="mb-3 font-medium">Niveles (A1–C2)</h3>
        <div className="mb-4 space-y-2">
          <Select
            value={level.language_id}
            onChange={(e) =>
              setLevel({ ...level, language_id: Number(e.target.value) })
            }
          >
            <option value={0}>Selecciona idioma…</option>
            {languages.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
          <div className="flex gap-2">
            <Input
              placeholder="Código (A1)"
              value={level.code}
              onChange={(e) => setLevel({ ...level, code: e.target.value })}
            />
            <Input
              placeholder="Nombre"
              value={level.name}
              onChange={(e) => setLevel({ ...level, name: e.target.value })}
            />
          </div>
          <Button
            className="w-full"
            disabled={!level.language_id || !level.code}
            onClick={() =>
              createLevel.mutate(level, {
                onSuccess: () =>
                  setLevel({ language_id: level.language_id, code: "", name: "" }),
                onError: onMutationError("No se pudo crear el nivel"),
              })
            }
          >
            Añadir nivel
          </Button>
        </div>
        <ul className="space-y-1 text-sm">
          {levels.map((lv) => (
            <li
              key={lv.id}
              className="flex items-center justify-between rounded bg-slate-50 px-3 py-1.5"
            >
              <span>
                <Badge>{lv.code}</Badge> {lv.name}
              </span>
              <Button
                variant="ghost"
                onClick={() =>
                  delLevel.mutate(lv.id, {
                    onError: onMutationError("No se pudo eliminar (¿tiene cursos?)"),
                  })
                }
              >
                ✕
              </Button>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

// ---------------- Courses ----------------
function CoursesPanel() {
  const { data: courses = [] } = useCourses();
  const { data: levels = [] } = useLevels();
  const create = useCreateCourse();
  const del = useDeleteCourse();
  const [form, setForm] = useState({
    level_id: 0,
    name: "",
    max_students: 20,
    start_date: "",
    end_date: "",
  });
  const [editing, setEditing] = useState<Course | null>(null);
  const [toDelete, setToDelete] = useState<Course | null>(null);

  const levelCode = (id: number) => levels.find((l) => l.id === id)?.code ?? id;

  function submit() {
    if (form.max_students < 1) {
      notify("El cupo debe ser al menos 1", "error");
      return;
    }
    create.mutate(
      {
        ...form,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
      },
      {
        onSuccess: () => {
          setForm({ level_id: form.level_id, name: "", max_students: 20, start_date: "", end_date: "" });
          notify("Curso creado", "success");
        },
        onError: onMutationError("No se pudo crear el curso"),
      },
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-1">
        <h3 className="mb-3 font-medium">Nuevo curso</h3>
        <div className="space-y-3">
          <Field label="Nivel">
            <Select
              value={form.level_id}
              onChange={(e) => setForm({ ...form, level_id: Number(e.target.value) })}
            >
              <option value={0}>Selecciona nivel…</option>
              {levels.map((lv) => (
                <option key={lv.id} value={lv.id}>
                  {lv.code} · {lv.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Nombre del curso">
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <Field label="Máx. alumnos">
            <Input
              type="number"
              min={1}
              value={form.max_students}
              onChange={(e) =>
                setForm({ ...form, max_students: Number(e.target.value) })
              }
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Inicio (término)">
              <Input
                type="date"
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
              />
            </Field>
            <Field label="Fin (término)">
              <Input
                type="date"
                value={form.end_date}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
              />
            </Field>
          </div>
          <Button
            className="w-full"
            disabled={!form.level_id || !form.name}
            onClick={submit}
          >
            Crear curso
          </Button>
        </div>
      </Card>
      <Card className="lg:col-span-2">
        <Table>
          <thead>
            <tr>
              <Th>Curso</Th>
              <Th>Nivel</Th>
              <Th>Término</Th>
              <Th>Máx.</Th>
              <Th>Acciones</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {courses.map((c) => (
              <tr key={c.id}>
                <Td>{c.name}</Td>
                <Td>{levelCode(c.level_id)}</Td>
                <Td>
                  {c.start_date || c.end_date
                    ? `${c.start_date ?? "…"} → ${c.end_date ?? "…"}`
                    : "—"}
                </Td>
                <Td>{c.max_students}</Td>
                <Td>
                  <div className="flex gap-1">
                    <Button variant="ghost" onClick={() => setEditing(c)}>
                      Editar
                    </Button>
                    <Button variant="ghost" onClick={() => setToDelete(c)}>
                      Eliminar
                    </Button>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      {editing && (
        <EditCourseModal
          course={editing}
          levels={levels}
          onClose={() => setEditing(null)}
        />
      )}
      {toDelete && (
        <ConfirmDialog
          title="Eliminar curso"
          message={
            <>
              ¿Eliminar <strong>{toDelete.name}</strong>? Se borrarán sus horarios,
              matrículas, calificaciones y asistencias.
            </>
          }
          busy={del.isPending}
          onClose={() => setToDelete(null)}
          onConfirm={() =>
            del.mutate(toDelete.id, {
              onSuccess: () => {
                setToDelete(null);
                notify("Curso eliminado", "success");
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

function EditCourseModal({
  course,
  levels,
  onClose,
}: {
  course: Course;
  levels: { id: number; code: string; name: string }[];
  onClose: () => void;
}) {
  const update = useUpdateCourse();
  const [form, setForm] = useState({
    level_id: course.level_id,
    name: course.name,
    max_students: course.max_students,
    start_date: course.start_date ?? "",
    end_date: course.end_date ?? "",
  });

  function save() {
    update.mutate(
      {
        id: course.id,
        ...form,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
      },
      {
        onSuccess: () => {
          notify("Curso actualizado", "success");
          onClose();
        },
        onError: onMutationError("No se pudo actualizar"),
      },
    );
  }

  return (
    <Modal title="Editar curso" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Nivel">
          <Select
            value={form.level_id}
            onChange={(e) => setForm({ ...form, level_id: Number(e.target.value) })}
          >
            {levels.map((lv) => (
              <option key={lv.id} value={lv.id}>
                {lv.code} · {lv.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Nombre">
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </Field>
        <Field label="Máx. alumnos">
          <Input
            type="number"
            min={1}
            value={form.max_students}
            onChange={(e) => setForm({ ...form, max_students: Number(e.target.value) })}
          />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Inicio">
            <Input
              type="date"
              value={form.start_date}
              onChange={(e) => setForm({ ...form, start_date: e.target.value })}
            />
          </Field>
          <Field label="Fin">
            <Input
              type="date"
              value={form.end_date}
              onChange={(e) => setForm({ ...form, end_date: e.target.value })}
            />
          </Field>
        </div>
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

// ---------------- Rooms ----------------
function RoomsPanel() {
  const { data: rooms = [] } = useRooms();
  const create = useCreateRoom();
  const update = useUpdateRoom();
  const del = useDeleteRoom();
  const [form, setForm] = useState({ name: "", capacity: "" as number | "", is_virtual: false });
  const [toDelete, setToDelete] = useState<Room | null>(null);

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
          notify("Aula creada", "success");
        },
        onError: onMutationError("No se pudo crear el aula"),
      },
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-1">
        <h3 className="mb-3 font-medium">Nueva aula</h3>
        <div className="space-y-3">
          <Field label="Nombre">
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <Field label="Capacidad (opcional)">
            <Input
              type="number"
              min={1}
              value={form.capacity}
              onChange={(e) =>
                setForm({
                  ...form,
                  capacity: e.target.value === "" ? "" : Number(e.target.value),
                })
              }
            />
          </Field>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.is_virtual}
              onChange={(e) => setForm({ ...form, is_virtual: e.target.checked })}
            />
            Aula virtual
          </label>
          <Button className="w-full" disabled={create.isPending} onClick={submit}>
            Crear aula
          </Button>
        </div>
      </Card>
      <Card className="lg:col-span-2">
        <Table>
          <thead>
            <tr>
              <Th>Aula</Th>
              <Th>Capacidad</Th>
              <Th>Tipo</Th>
              <Th>Acciones</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rooms.map((r) => (
              <tr key={r.id}>
                <Td>{r.name}</Td>
                <Td>{r.capacity ?? "—"}</Td>
                <Td>
                  <Badge color={r.is_virtual ? "indigo" : "slate"}>
                    {r.is_virtual ? "Virtual" : "Física"}
                  </Badge>
                </Td>
                <Td>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      onClick={() =>
                        update.mutate(
                          { id: r.id, is_virtual: !r.is_virtual },
                          { onError: onMutationError("No se pudo actualizar") },
                        )
                      }
                    >
                      Cambiar tipo
                    </Button>
                    <Button variant="ghost" onClick={() => setToDelete(r)}>
                      Eliminar
                    </Button>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      {toDelete && (
        <ConfirmDialog
          title="Eliminar aula"
          message={
            <>
              ¿Eliminar <strong>{toDelete.name}</strong>? Los horarios que la usen
              quedarán sin aula asignada.
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

// ---------------- Teachers (qualifications + availability) ----------------
function TeachersPanel() {
  const { data: teachers = [] } = useUsers("teacher");
  const { data: languages = [] } = useLanguages();
  const [teacherId, setTeacherId] = useState(0);

  const { data: teacherLangs = [] } = useTeacherLanguages(teacherId || undefined);
  const { data: availability = [] } = useTeacherAvailability(teacherId || undefined);
  const setLangs = useSetTeacherLanguages();
  const addAvail = useAddAvailability();
  const delAvail = useDeleteAvailability();

  const selectedLangIds = new Set(teacherLangs.map((t) => t.language_id));
  const [avail, setAvail] = useState({ day_of_week: 0, start_time: "08:00", end_time: "14:00" });

  function toggleLang(languageId: number) {
    const next = new Set(selectedLangIds);
    if (next.has(languageId)) next.delete(languageId);
    else next.add(languageId);
    setLangs.mutate(
      { teacherId, language_ids: [...next] },
      { onError: onMutationError("No se pudo guardar la cualificación") },
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <Field label="Profesor">
          <Select
            value={teacherId}
            onChange={(e) => setTeacherId(Number(e.target.value))}
          >
            <option value={0}>Selecciona un profesor…</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.full_name}
              </option>
            ))}
          </Select>
        </Field>
      </Card>

      {teacherId > 0 && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <h3 className="mb-1 font-medium">Idiomas que puede impartir</h3>
            <p className="mb-3 text-xs text-slate-500">
              Sin selección = sin restricción (se le puede asignar cualquier idioma).
            </p>
            <div className="space-y-1 text-sm">
              {languages.map((l) => (
                <label key={l.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selectedLangIds.has(l.id)}
                    onChange={() => toggleLang(l.id)}
                  />
                  {l.name}
                </label>
              ))}
            </div>
          </Card>

          <Card>
            <h3 className="mb-3 font-medium">Disponibilidad semanal</h3>
            <div className="mb-3 flex flex-wrap items-end gap-2">
              <Select
                className="w-auto"
                value={avail.day_of_week}
                onChange={(e) =>
                  setAvail({ ...avail, day_of_week: Number(e.target.value) })
                }
              >
                {DAYS.map((d, i) => (
                  <option key={i} value={i}>
                    {d}
                  </option>
                ))}
              </Select>
              <Input
                type="time"
                className="w-auto"
                value={avail.start_time}
                onChange={(e) => setAvail({ ...avail, start_time: e.target.value })}
              />
              <Input
                type="time"
                className="w-auto"
                value={avail.end_time}
                onChange={(e) => setAvail({ ...avail, end_time: e.target.value })}
              />
              <Button
                onClick={() =>
                  addAvail.mutate(
                    {
                      teacherId,
                      day_of_week: avail.day_of_week,
                      start_time: `${avail.start_time}:00`,
                      end_time: `${avail.end_time}:00`,
                    },
                    { onError: onMutationError("Rango inválido") },
                  )
                }
              >
                Añadir
              </Button>
            </div>
            <ul className="space-y-1 text-sm">
              {availability.length === 0 && (
                <li className="text-slate-400">Sin ventanas (disponible siempre).</li>
              )}
              {availability.map((w) => (
                <li
                  key={w.id}
                  className="flex items-center justify-between rounded bg-slate-50 px-3 py-1.5"
                >
                  <span>
                    {DAYS[w.day_of_week]} · {formatTime(w.start_time)}–
                    {formatTime(w.end_time)}
                  </span>
                  <Button
                    variant="ghost"
                    onClick={() => delAvail.mutate({ teacherId, id: w.id })}
                  >
                    ✕
                  </Button>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </div>
  );
}

// ---------------- Schedules ----------------
function SchedulesPanel() {
  // Interactive weekly calendar with drag-and-drop + live conflict validation.
  return <SchedulePlanner />;
}

// ---------------- Enrollments ----------------
function EnrollmentsPanel() {
  const { data: enrollments = [] } = useEnrollments();
  const { data: courses = [] } = useCourses();
  const { data: students = [] } = useUsers("student");
  const [wizardOpen, setWizardOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setWizardOpen(true)}>+ Matricular alumno</Button>
      </div>
      {wizardOpen && <EnrollWizard onClose={() => setWizardOpen(false)} />}
      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Alumno</Th>
              <Th>Curso</Th>
              <Th>Estado</Th>
              <Th>Pago</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {enrollments.map((e) => (
              <tr key={e.id}>
                <Td>
                  {students.find((s) => s.id === e.student_id)?.full_name ??
                    e.student_id}
                </Td>
                <Td>{courses.find((c) => c.id === e.course_id)?.name ?? e.course_id}</Td>
                <Td>
                  <Badge color={e.status === "active" ? "green" : "slate"}>
                    {e.status}
                  </Badge>
                </Td>
                <Td>
                  <Badge
                    color={
                      e.payment_status === "paid"
                        ? "green"
                        : e.payment_status === "overdue"
                          ? "red"
                          : "amber"
                    }
                  >
                    {e.payment_status}
                  </Badge>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
