import { useEffect, useState } from "react";

import {
  ActionMenu, Badge, Button, Card, ConfirmDialog, EmptyState, Field, Input,
  MetaItem, Modal, ModalActions, PageHeader, SearchInput, SegmentedControl, Select,
  Table, Td, Th,
} from "../../components/ui";
import { IconUsers } from "../../components/icons";
import { EnrollWizard } from "../enrollments/EnrollWizard";
import { AssignTeacherModal } from "./AssignTeacherModal";
import { RegisterTeacherWizard } from "./RegisterTeacherWizard";
import {
  useCreateUser, useDeleteUser, useLanguages, useNationalities, useSetTeacherLanguages, useTeacherLanguages, useUpdateUser, useUsers,
} from "../../lib/queries";
import { notify } from "../../lib/toast";
import type { Nationality, Role, User } from "../../lib/types";
import { EMAIL_RE, PASSWORD_MIN_LENGTH, onMutationError } from "./shared";
import { useAuth } from "../../auth/AuthContext";

import type { Permission } from "../../lib/types";

const ALL_PERMISSIONS: { id: Permission; label: string; description: string }[] = [
  { id: "manage_teachers", label: "Gestionar Profesores", description: "Crear, editar y cualificar profesores" },
  { id: "manage_students", label: "Gestionar Alumnos", description: "Crear y editar información de alumnos" },
  { id: "manage_catalog", label: "Gestionar Catálogo", description: "Idiomas, tracks, niveles, cursos y aulas" },
  { id: "manage_schedules", label: "Gestionar Horarios", description: "Crear, editar y reasignar franjas horarias" },
  { id: "manage_enrollments", label: "Gestionar Matrículas", description: "Inscribir, congelar o certificar alumnos" },
  { id: "manage_finance", label: "Gestionar Finanzas", description: "Cargos, cobros y emisión de comprobantes" },
  { id: "manage_grades", label: "Gestionar Calificaciones", description: "Libro de notas y asistencia general" },
  { id: "view_reports", label: "Ver Reportes", description: "Acceso a reportes académicos y financieros" },
];

const EMPTY_USER = {
  email: "",
  full_name: "",
  role: "student",
  password: "",
  timezone: "UTC",
  phone: "",
  address: "",
  cui_passport: "",
  nationality_id: 0,
  permissions: [] as Permission[],
};

import { StudentAccountStatementModal } from "./StudentAccountStatementModal";

type RoleTab = "student" | "teacher" | "assistant" | "admin" | "all";

/** Which permission puts a user in charge of a given role — the same table the
 *  API enforces (`users._MANAGEABLE_ROLES`). Kept in step with it deliberately:
 *  offering an action the API will refuse is worse than not offering it. */
function useManageableRoles(): (role: Role) => boolean {
  const { user, hasPermission } = useAuth();
  return (role: Role) => {
    if (!user) return false;
    if (user.role === "admin" || user.role === "superadmin") return true;
    if (user.role !== "assistant") return false;
    if (role === "teacher") return hasPermission("manage_teachers");
    if (role === "student") return hasPermission("manage_students");
    // An assistant never manages another staff account, whatever they hold.
    return false;
  };
}

export function UsersPanel() {
  const { data: users = [] } = useUsers();
  const { data: nationalities = [] } = useNationalities();
  const del = useDeleteUser();
  const canManage = useManageableRoles();
  const { hasPermission } = useAuth();

  const [activeTab, setActiveTab] = useState<RoleTab>("student");
  const [searchTerm, setSearchTerm] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [toDelete, setToDelete] = useState<User | null>(null);
  const [statementStudent, setStatementStudent] = useState<User | null>(null);

  const [enrollStudentId, setEnrollStudentId] = useState<number | null>(null);
  const [teacherWizardId, setTeacherWizardId] = useState<number | null | "new">(null);

  // Filter users by active tab role & search term
  const filteredUsers = users.filter((u) => {
    // Role match
    let roleMatch = true;
    if (activeTab === "student") roleMatch = u.role === "student";
    else if (activeTab === "teacher") roleMatch = u.role === "teacher";
    else if (activeTab === "assistant") roleMatch = u.role === "assistant";
    else if (activeTab === "admin") roleMatch = u.role === "admin" || u.role === "superadmin";

    if (!roleMatch) return false;

    // Search term match
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      u.full_name.toLowerCase().includes(term) ||
      u.email.toLowerCase().includes(term) ||
      (u.cui_passport && u.cui_passport.toLowerCase().includes(term)) ||
      (u.phone && u.phone.toLowerCase().includes(term))
    );
  });

  const countStudents = users.filter((u) => u.role === "student").length;
  const countTeachers = users.filter((u) => u.role === "teacher").length;
  const countAssistants = users.filter((u) => u.role === "assistant").length;
  const countAdmins = users.filter((u) => u.role === "admin" || u.role === "superadmin").length;

  const createLabel =
    activeTab === "teacher"
      ? "Nuevo profesor"
      : activeTab === "student"
        ? "Nuevo alumno"
        : activeTab === "assistant"
          ? "Nuevo asistente"
          : "Nuevo usuario";

  // Only offer the tabs whose population this account actually manages, and only
  // offer to create into a tab that would accept the new user.
  const TABS: { value: RoleTab; label: string; count: number; role: Role | null }[] = [
    { value: "student", label: "Alumnos", count: countStudents, role: "student" },
    { value: "teacher", label: "Profesores", count: countTeachers, role: "teacher" },
    { value: "assistant", label: "Asistentes", count: countAssistants, role: "assistant" },
    { value: "admin", label: "Administradores", count: countAdmins, role: "admin" },
    { value: "all", label: "Todos", count: users.length, role: null },
  ];
  const visibleTabs = TABS.filter((t) => t.role === null || canManage(t.role));
  const canCreateHere =
    activeTab === "all"
      ? visibleTabs.some((t) => t.role !== null)
      : canManage(activeTab as Role);

  // An assistant landing on a tab they cannot see would stare at an empty table
  // with no way to tell why, so move them to the first one that is theirs.
  useEffect(() => {
    if (!visibleTabs.some((t) => t.value === activeTab) && visibleTabs.length > 0) {
      setActiveTab(visibleTabs[0].value);
    }
  }, [activeTab, visibleTabs.length]);

  return (
    <div>
      <PageHeader
        title="Usuarios"
        meta={
          <>
            <MetaItem value={countStudents} label="alumnos" />
            <MetaItem value={countTeachers} label="profesores" />
            <MetaItem value={countAssistants} label="asistentes" />
            <MetaItem value={countAdmins} label="administradores" />
          </>
        }
        actions={
          <>
            {canCreateHere && (
              <Button variant="secondary" onClick={() => setIsCreateOpen(true)}>
                {createLabel}
              </Button>
            )}
            {activeTab === "student" && hasPermission("manage_enrollments") && (
              <Button onClick={() => setEnrollStudentId(0)}>Inscribir en curso</Button>
            )}
            {activeTab === "teacher" && hasPermission("manage_teachers") && (
              <Button onClick={() => setTeacherWizardId("new")}>
                Registrar profesor y asignarlo
              </Button>
            )}
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2.5 rounded-xl border border-slate-200 bg-white p-2.5">
        <SegmentedControl
          value={activeTab}
          onChange={setActiveTab}
          options={visibleTabs.map(({ value, label, count }) => ({ value, label, count }))}
        />
        <SearchInput
          className="w-full sm:ml-auto sm:w-72"
          placeholder="Buscar por nombre, correo, CUI o teléfono"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <Card padding="none" className="overflow-hidden">
        {filteredUsers.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={<IconUsers className="h-5 w-5" />}
              title={searchTerm ? "Nadie coincide con la búsqueda" : "No hay usuarios aquí"}
              message={
                searchTerm
                  ? "Prueba con otro nombre, correo o número de teléfono."
                  : "Crea el primero para empezar."
              }
              action={
                searchTerm ? (
                  <Button variant="secondary" onClick={() => setSearchTerm("")}>
                    Limpiar búsqueda
                  </Button>
                ) : canCreateHere ? (
                  <Button onClick={() => setIsCreateOpen(true)}>{createLabel}</Button>
                ) : null
              }
            />
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Usuario</Th>
                <Th>Contacto</Th>
                <Th>Rol</Th>
                <Th align="right">Acciones</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredUsers.map((u) => {
                const userNat = nationalities.find((n) => n.id === u.nationality_id);
                const location = [userNat?.name, u.address].filter(Boolean).join(" · ");
                return (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <Td>
                      <div className="font-medium text-slate-900">{u.full_name}</div>
                      <div className="mt-0.5 font-mono text-xs text-slate-500">{u.email}</div>
                      {u.cui_passport && (
                        <div className="mt-0.5 font-mono text-xs text-slate-400">
                          {u.cui_passport}
                        </div>
                      )}
                    </Td>

                    <Td>
                      <div className="tabular text-slate-800">{u.phone || "—"}</div>
                      {location && (
                        <div className="mt-0.5 max-w-xs truncate text-xs text-slate-500" title={location}>
                          {location}
                        </div>
                      )}
                    </Td>

                    <Td>
                      <Badge
                        color={
                          u.role === "admin" || u.role === "superadmin"
                            ? "indigo"
                            : u.role === "teacher"
                              ? "amber"
                              : u.role === "assistant"
                                ? "sky"
                                : "slate"
                        }
                      >
                        {u.role === "student"
                          ? "Alumno"
                          : u.role === "teacher"
                            ? "Profesor"
                            : u.role === "assistant"
                              ? "Asistente"
                              : u.role === "superadmin"
                                ? "Superadmin"
                                : "Admin"}
                      </Badge>
                      {u.role === "teacher" && (
                        <div className="mt-1">
                          <TeacherQualificationsSubline teacherId={u.id} />
                        </div>
                      )}
                    </Td>

                    <Td align="right">
                      <ActionMenu
                        items={[
                          ...(u.role === "student"
                            ? [
                                {
                                  label: "Estado de cuenta",
                                  onClick: () => setStatementStudent(u),
                                },
                                {
                                  label: "Inscribir en curso",
                                  onClick: () => setEnrollStudentId(u.id),
                                },
                              ]
                            : []),
                          ...(u.role === "teacher"
                            ? [
                                {
                                  label: "Asignar a un curso",
                                  onClick: () => setTeacherWizardId(u.id),
                                },
                              ]
                            : []),
                          ...(canManage(u.role)
                            ? [
                                {
                                  label: "Editar usuario",
                                  onClick: () => setEditing(u),
                                },
                                {
                                  label: "Eliminar usuario",
                                  onClick: () => setToDelete(u),
                                  danger: true,
                                },
                              ]
                            : []),
                        ]}
                      />
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      {/* Modals & Wizards */}
      {statementStudent && (
        <StudentAccountStatementModal
          student={statementStudent}
          onClose={() => setStatementStudent(null)}
        />
      )}
      {isCreateOpen && (
        <CreateUserModal
          defaultRole={activeTab === "teacher" ? "teacher" : activeTab === "admin" ? "admin" : "student"}
          onClose={() => setIsCreateOpen(false)}
          nationalities={nationalities}
        />
      )}

      {enrollStudentId !== null && (
        <EnrollWizard
          initialStudentId={enrollStudentId === 0 ? undefined : enrollStudentId}
          onClose={() => setEnrollStudentId(null)}
        />
      )}

      {/* "new" is onboarding — account, qualifications, course and timetable —
          and stays the full wizard. Assigning somebody who already exists to
          another course is one step. */}
      {teacherWizardId === "new" && (
        <RegisterTeacherWizard onClose={() => setTeacherWizardId(null)} />
      )}
      {teacherWizardId !== null && teacherWizardId !== "new" && (
        <AssignTeacherModal
          initialTeacherId={teacherWizardId}
          onClose={() => setTeacherWizardId(null)}
        />
      )}

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

function CreateUserModal({
  defaultRole = "student",
  onClose,
  nationalities,
}: {
  defaultRole?: string;
  onClose: () => void;
  nationalities: Nationality[];
}) {
  const create = useCreateUser();
  const [form, setForm] = useState({ ...EMPTY_USER, role: defaultRole });
  const [errors, setErrors] = useState<Record<string, string>>({});

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!form.full_name.trim()) e.full_name = "Requerido";
    if (!EMAIL_RE.test(form.email)) e.email = "Correo no válido";
    if (!form.cui_passport.trim()) e.cui_passport = "Requerido (CUI o Pasaporte)";
    if (form.password.length < PASSWORD_MIN_LENGTH)
      e.password = `Mínimo ${PASSWORD_MIN_LENGTH} caracteres`;
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function submit() {
    if (!validate()) return;
    create.mutate(
      {
        ...form,
        cui_passport: form.cui_passport.trim() || null,
        phone: form.phone.trim() || null,
        address: form.address.trim() || null,
        nationality_id: form.nationality_id || null,
      } as never,
      {
        onSuccess: () => {
          setForm(EMPTY_USER);
          setErrors({});
          notify("Usuario creado con éxito", "success");
          onClose();
        },
        onError: onMutationError("No se pudo crear el usuario"),
      },
    );
  }

  return (
    <Modal
      title="Registrar Nuevo Usuario"
      description="Crea una nueva cuenta de alumno, profesor o administrador"
      onClose={onClose}
      onSubmit={submit}
      footer={
        <ModalActions>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? "Creando…" : "Crear Usuario"}
          </Button>
        </ModalActions>
      }
    >
      <div className="space-y-4">
        <Field label="Nombre completo" error={errors.full_name}>
          <Input
            placeholder="Ej. Carlos Mendoza"
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
          />
        </Field>

        <Field label="Correo electrónico" error={errors.email}>
          <Input
            type="email"
            placeholder="carlos@ejemplo.com"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </Field>

        <Field label="CUI o pasaporte" error={errors.cui_passport}>
          <Input
            placeholder="Ej. 2540 12345 0101 o A12345678"
            value={form.cui_passport}
            onChange={(e) => setForm({ ...form, cui_passport: e.target.value })}
          />
        </Field>

        <Field label="Rol">
          <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="student">Alumno</option>
            <option value="teacher">Profesor</option>
            <option value="assistant">Asistente / Secretaría</option>
            <option value="admin">Administrador</option>
          </Select>
        </Field>

        {form.role === "assistant" && (
          <Field label="Permisos asignados" hint="Selecciona los módulos a los que el asistente tendrá acceso">
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {ALL_PERMISSIONS.map((perm) => {
                const checked = form.permissions.includes(perm.id);
                return (
                  <label
                    key={perm.id}
                    className={`flex items-start gap-2.5 rounded-lg border p-2.5 cursor-pointer text-xs transition-colors ${
                      checked ? "border-brand-500 bg-brand-50/50" : "border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                      checked={checked}
                      onChange={(e) => {
                        const next = e.target.checked
                          ? [...form.permissions, perm.id]
                          : form.permissions.filter((p) => p !== perm.id);
                        setForm({ ...form, permissions: next });
                      }}
                    />
                    <div>
                      <div className="font-medium text-slate-800">{perm.label}</div>
                      <div className="text-slate-500 text-2xs">{perm.description}</div>
                    </div>
                  </label>
                );
              })}
            </div>
          </Field>
        )}

        <Field
          label="Contraseña inicial"
          error={errors.password}
          hint={`Mínimo ${PASSWORD_MIN_LENGTH} caracteres. El usuario podrá cambiarla desde su perfil.`}
        >
          <Input
            type="password"
            placeholder="••••••••"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Teléfono">
            <Input
              placeholder="+502 5555-5555"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </Field>

          <Field label="Nacionalidad">
            <Select
              value={form.nationality_id}
              onChange={(e) => setForm({ ...form, nationality_id: Number(e.target.value) })}
            >
              <option value={0}>Sin especificar</option>
              {nationalities.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Dirección">
          <Input
            placeholder="Ej. Zona 10, Ciudad de Guatemala"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
          />
        </Field>
      </div>
    </Modal>
  );
}

function TeacherQualificationsSubline({ teacherId }: { teacherId: number }) {
  const { data: teacherLangs = [] } = useTeacherLanguages(teacherId);
  const { data: languages = [] } = useLanguages();

  if (teacherLangs.length === 0) {
    return <span className="text-xs text-slate-500">Todas las materias</span>;
  }

  const qualifiedNames = teacherLangs
    .map((tl) => languages.find((l) => l.id === tl.language_id)?.name)
    .filter(Boolean)
    .join(", ");

  return (
    <span
      className="block max-w-[14rem] truncate text-xs text-slate-500"
      title={qualifiedNames}
    >
      {qualifiedNames}
    </span>
  );
}

function EditUserModal({ user, onClose }: { user: User; onClose: () => void }) {
  const update = useUpdateUser();
  const { data: nationalities = [] } = useNationalities();
  const { data: languages = [] } = useLanguages();
  const { data: teacherLangs = [] } = useTeacherLanguages(user.id);
  const setTeacherLangs = useSetTeacherLanguages();

  const [form, setForm] = useState({
    full_name: user.full_name,
    email: user.email,
    cui_passport: user.cui_passport ?? "",
    role: user.role as string,
    timezone: user.timezone,
    max_weekly_hours: user.max_weekly_hours ?? ("" as number | ""),
    password: "",
    phone: user.phone ?? "",
    address: user.address ?? "",
    nationality_id: user.nationality_id ?? 0,
    permissions: user.permissions || [],
  });

  const [selectedLangIds, setSelectedLangIds] = useState<number[]>([]);
  const [langLoaded, setLangLoaded] = useState(false);

  useEffect(() => {
    if (user.role === "teacher" && teacherLangs && !langLoaded) {
      setSelectedLangIds(teacherLangs.map((tl) => tl.language_id));
      setLangLoaded(true);
    }
  }, [user.role, teacherLangs, langLoaded]);

  async function save() {
    if (!EMAIL_RE.test(form.email)) {
      notify("Correo no válido", "error");
      return;
    }
    if (!form.cui_passport.trim()) {
      notify("CUI o Pasaporte es obligatorio", "error");
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
      cui_passport: form.cui_passport.trim() || null,
      role: form.role,
      timezone: form.timezone,
      max_weekly_hours: form.max_weekly_hours === "" ? null : Number(form.max_weekly_hours),
      phone: form.phone.trim() || null,
      address: form.address.trim() || null,
      nationality_id: form.nationality_id || null,
      permissions: form.role === "assistant" ? form.permissions : [],
    };
    if (form.password) patch.password = form.password;

    try {
      await update.mutateAsync(patch as never);
      if (form.role === "teacher") {
        await setTeacherLangs.mutateAsync({
          teacherId: user.id,
          language_ids: selectedLangIds,
        });
      }
      notify("Usuario actualizado con éxito", "success");
      onClose();
    } catch (e) {
      onMutationError("No se pudo actualizar")(e);
    }
  }

  return (
    <Modal
      title="Editar usuario"
      description={user.email}
      onClose={onClose}
      onSubmit={save}
      footer={
        <ModalActions>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={update.isPending || setTeacherLangs.isPending}>
            {update.isPending || setTeacherLangs.isPending ? "Guardando…" : "Guardar cambios"}
          </Button>
        </ModalActions>
      }
    >
      <div className="space-y-4">
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
        <Field label="CUI o pasaporte">
          <Input
            value={form.cui_passport}
            onChange={(e) => setForm({ ...form, cui_passport: e.target.value })}
          />
        </Field>
        <Field label="Rol">
          <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="student">Alumno</option>
            <option value="teacher">Profesor</option>
            <option value="assistant">Asistente / Secretaría</option>
            <option value="admin">Administrador</option>
          </Select>
        </Field>

        {form.role === "assistant" && (
          <Field label="Permisos asignados" hint="Selecciona los módulos a los que el asistente tendrá acceso">
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {ALL_PERMISSIONS.map((perm) => {
                const checked = form.permissions.includes(perm.id);
                return (
                  <label
                    key={perm.id}
                    className={`flex items-start gap-2.5 rounded-lg border p-2.5 cursor-pointer text-xs transition-colors ${
                      checked ? "border-brand-500 bg-brand-50/50" : "border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                      checked={checked}
                      onChange={(e) => {
                        const next = e.target.checked
                          ? [...form.permissions, perm.id]
                          : form.permissions.filter((p) => p !== perm.id);
                        setForm({ ...form, permissions: next });
                      }}
                    />
                    <div>
                      <div className="font-medium text-slate-800">{perm.label}</div>
                      <div className="text-slate-500 text-2xs">{perm.description}</div>
                    </div>
                  </label>
                );
              })}
            </div>
          </Field>
        )}

        {form.role === "teacher" && (
          <>
            <Field
              label="Materias que puede impartir"
              hint="Si no marcas ninguna, el profesor queda habilitado para cualquier materia."
            >
              <div className="flex flex-wrap gap-1.5">
                {languages.map((lang) => {
                  const isSelected = selectedLangIds.includes(lang.id);
                  return (
                    <button
                      key={lang.id}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() =>
                        setSelectedLangIds(
                          isSelected
                            ? selectedLangIds.filter((id) => id !== lang.id)
                            : [...selectedLangIds, lang.id],
                        )
                      }
                      className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                        isSelected
                          ? "border-brand-600 bg-brand-600 text-white"
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                      }`}
                    >
                      {lang.name}
                    </button>
                  );
                })}
              </div>
            </Field>

            <Field label="Tope de horas semanales">
              <Input
                type="number"
                placeholder="Ej. 20"
                value={form.max_weekly_hours}
                onChange={(e) =>
                  setForm({
                    ...form,
                    max_weekly_hours: e.target.value === "" ? "" : Number(e.target.value),
                  })
                }
              />
            </Field>
          </>
        )}

        <Field label="Nueva contraseña" hint="Déjala en blanco para no cambiarla.">
          <Input
            type="password"
            placeholder="••••••••"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </Field>
        <Field label="Teléfono">
          <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </Field>
        <Field label="Dirección">
          <Input
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
          />
        </Field>
        <Field label="Nacionalidad">
          <Select
            value={form.nationality_id}
            onChange={(e) => setForm({ ...form, nationality_id: Number(e.target.value) })}
          >
            <option value={0}>Sin especificar</option>
            {nationalities.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </Modal>
  );
}
