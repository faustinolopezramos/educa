import { useEffect, useState } from "react";

import {
  ActionMenu, Badge, Button, Card, ConfirmDialog, Field, Input, Modal, ModalActions, Select, Table, Td, Th,
} from "../../components/ui";
import { EnrollWizard } from "../enrollments/EnrollWizard";
import { RegisterTeacherWizard } from "./RegisterTeacherWizard";
import {
  useCreateUser, useDeleteUser, useLanguages, useNationalities, useSetTeacherLanguages, useTeacherLanguages, useUpdateUser, useUsers,
} from "../../lib/queries";
import { notify } from "../../lib/toast";
import type { Nationality, User } from "../../lib/types";
import { EMAIL_RE, PASSWORD_MIN_LENGTH, onMutationError } from "./shared";

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
};

import { StudentAccountStatementModal } from "./StudentAccountStatementModal";

type RoleTab = "student" | "teacher" | "admin" | "all";

export function UsersPanel() {
  const { data: users = [] } = useUsers();
  const { data: nationalities = [] } = useNationalities();
  const del = useDeleteUser();

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
  const countAdmins = users.filter((u) => u.role === "admin" || u.role === "superadmin").length;

  return (
    <div className="space-y-4">
      {/* Role Navigation Tabs & Quick Search */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1 rounded-xl bg-slate-200/60 p-1 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab("student")}
            className={`flex items-center gap-2 rounded-lg px-3 py-1.5 font-medium transition ${
              activeTab === "student"
                ? "bg-white text-slate-900 shadow-2xs font-semibold"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <span>Alumnos</span>
            <span className="rounded-full bg-slate-200 px-1.5 py-0.2 text-[10px] text-slate-700">
              {countStudents}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("teacher")}
            className={`flex items-center gap-2 rounded-lg px-3 py-1.5 font-medium transition ${
              activeTab === "teacher"
                ? "bg-white text-slate-900 shadow-2xs font-semibold"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <span>Profesores</span>
            <span className="rounded-full bg-slate-200 px-1.5 py-0.2 text-[10px] text-slate-700">
              {countTeachers}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("admin")}
            className={`flex items-center gap-2 rounded-lg px-3 py-1.5 font-medium transition ${
              activeTab === "admin"
                ? "bg-white text-slate-900 shadow-2xs font-semibold"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <span>Administradores</span>
            <span className="rounded-full bg-slate-200 px-1.5 py-0.2 text-[10px] text-slate-700">
              {countAdmins}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("all")}
            className={`flex items-center gap-2 rounded-lg px-3 py-1.5 font-medium transition ${
              activeTab === "all"
                ? "bg-white text-slate-900 shadow-2xs font-semibold"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <span>Todos</span>
            <span className="rounded-full bg-slate-200 px-1.5 py-0.2 text-[10px] text-slate-700">
              {users.length}
            </span>
          </button>
        </div>

        {/* Quick Search & Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <Input
            className="w-64 text-xs"
            placeholder="Buscar por nombre, correo o teléfono…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />

          {activeTab === "student" && (
            <>
              <Button variant="secondary" onClick={() => setIsCreateOpen(true)}>
                + Crear Alumno
              </Button>
              <Button variant="primary" onClick={() => setEnrollStudentId(0)}>
                + Inscribir en Curso
              </Button>
            </>
          )}

          {activeTab === "teacher" && (
            <>
              <Button variant="secondary" onClick={() => setIsCreateOpen(true)}>
                + Crear Profesor
              </Button>
              <Button variant="primary" onClick={() => setTeacherWizardId("new")}>
                + Asignar a Curso
              </Button>
            </>
          )}

          {(activeTab === "admin" || activeTab === "all") && (
            <Button variant="primary" onClick={() => setIsCreateOpen(true)}>
              + Nuevo Usuario
            </Button>
          )}
        </div>
      </div>

      {activeTab === "teacher" && (
        <div className="flex items-center gap-3 rounded-xl border border-brand-200 bg-brand-50/70 p-3.5 text-xs text-brand-900">
          <div>
            <div className="font-semibold text-sm text-brand-950">Gestión Integrada de Docentes</div>
            <div className="text-brand-800 mt-0.5">
              Asigna cursos a profesores, cualifica materias/idiomas, configura tarifas por hora y gestiona sus credenciales.
            </div>
          </div>
        </div>
      )}

      {/* Minimalist Full Width Table Card */}
      <Card className="w-full shadow-xs overflow-hidden !p-0">
        {filteredUsers.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs">
            No hay usuarios registrados en esta categoría o búsqueda.
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Usuario</Th>
                <Th>Contacto y Ubicación</Th>
                <Th>Rol</Th>
                <Th>Acciones</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredUsers.map((u) => {
                const userNat = nationalities.find((n) => n.id === u.nationality_id);
                const contactLocationText = [userNat?.name, u.address].filter(Boolean).join(" · ");
                return (
                  <tr key={u.id} className="hover:bg-slate-50/70 transition-colors text-xs">
                    {/* 1. Usuario */}
                    <Td>
                      <div className="py-0.5">
                        <div className="font-semibold text-slate-900 text-sm flex items-center gap-2">
                          <span>{u.full_name}</span>
                          {u.cui_passport && (
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600 font-mono font-medium">
                              {u.cui_passport}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                          {u.email}
                        </div>
                      </div>
                    </Td>

                    {/* 2. Contacto y Ubicación */}
                    <Td>
                      <div className="py-0.5 space-y-0.5">
                        <div className="text-slate-800 font-mono text-xs font-medium">
                          {u.phone || "—"}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate max-w-xs" title={contactLocationText}>
                          {contactLocationText || "—"}
                        </div>
                      </div>
                    </Td>

                    {/* 3. Rol */}
                    <Td>
                      <div className="py-0.5 space-y-1">
                        <div>
                          <Badge color={u.role === "admin" || u.role === "superadmin" ? "indigo" : u.role === "teacher" ? "amber" : "slate"}>
                            {u.role === "student" ? "Alumno" : u.role === "teacher" ? "Profesor" : u.role === "superadmin" ? "SuperAdmin" : "Admin"}
                          </Badge>
                        </div>
                        {u.role === "teacher" && (
                          <div className="text-[11px] text-slate-500">
                            <TeacherQualificationsSubline teacherId={u.id} />
                          </div>
                        )}
                      </div>
                    </Td>

                    {/* 4. Acciones */}
                    <Td>
                      <ActionMenu
                        items={[
                          ...(u.role === "student"
                            ? [
                                {
                                  label: "Estado de Cuenta",
                                  onClick: () => setStatementStudent(u),
                                },
                                {
                                  label: "Inscribir en Curso",
                                  onClick: () => setEnrollStudentId(u.id),
                                },
                              ]
                            : []),
                          ...(u.role === "teacher"
                            ? [
                                {
                                  label: "Asignar Curso / Tarifas",
                                  onClick: () => setTeacherWizardId(u.id),
                                },
                              ]
                            : []),
                          {
                            label: "Editar Usuario",
                            onClick: () => setEditing(u),
                          },
                          {
                            label: "Eliminar",
                            onClick: () => setToDelete(u),
                            danger: true,
                          },
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

      {teacherWizardId !== null && (
        <RegisterTeacherWizard
          initialTeacherId={teacherWizardId === "new" ? undefined : teacherWizardId}
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
      <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
        <Field label="Nombre Completo (*)" error={errors.full_name}>
          <Input
            placeholder="Ej. Carlos Mendoza"
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
          />
        </Field>

        <Field label="Correo Electrónico (*)" error={errors.email}>
          <Input
            type="email"
            placeholder="carlos@ejemplo.com"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </Field>

        <Field label="CUI o Pasaporte (*)" error={errors.cui_passport}>
          <Input
            placeholder="Ej. 2540 12345 0101 o A12345678"
            value={form.cui_passport}
            onChange={(e) => setForm({ ...form, cui_passport: e.target.value })}
          />
        </Field>

        <Field label="Rol del Usuario">
          <Select
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
          >
            <option value="student">🎓 Alumno / Estudiante</option>
            <option value="teacher">👨‍🏫 Profesor / Docente</option>
            <option value="admin">👑 Administrador</option>
          </Select>
        </Field>

        <Field label="Contraseña Inicial (*)" error={errors.password}>
          <Input
            type="password"
            placeholder="••••••••"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </Field>

        <div className="grid grid-cols-2 gap-2">
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
    return <span className="text-[11px] text-slate-400">Todas las materias</span>;
  }

  const qualifiedNames = teacherLangs
    .map((tl) => languages.find((l) => l.id === tl.language_id)?.name)
    .filter(Boolean)
    .join(", ");

  return (
    <span className="text-[11px] text-amber-700 font-medium truncate max-w-[220px]" title={qualifiedNames}>
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
      <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
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
        <Field label="CUI / Pasaporte (*)">
          <Input
            value={form.cui_passport}
            onChange={(e) => setForm({ ...form, cui_passport: e.target.value })}
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
          <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 space-y-2">
            <div className="font-semibold text-xs text-amber-900 flex items-center gap-1.5">
              <span>📚</span> Materias / Idiomas Cualificados
            </div>
            <div className="text-[11px] text-amber-800 leading-snug">
              Selecciona las materias o idiomas que este profesor está cualificado para enseñar. Si dejas todas desmarcadas, estará habilitado para cualquier materia.
            </div>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {languages.map((lang) => {
                const isSelected = selectedLangIds.includes(lang.id);
                return (
                  <button
                    key={lang.id}
                    type="button"
                    onClick={() => {
                      if (isSelected) {
                        setSelectedLangIds(selectedLangIds.filter((id) => id !== lang.id));
                      } else {
                        setSelectedLangIds([...selectedLangIds, lang.id]);
                      }
                    }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition flex items-center gap-1 cursor-pointer ${
                      isSelected
                        ? "bg-amber-600 text-white border-amber-600 shadow-2xs font-semibold"
                        : "bg-white text-slate-700 border-slate-200 hover:border-amber-300"
                    }`}
                  >
                    <span>{isSelected ? "✓" : "+"}</span>
                    <span>{lang.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <Field label="Tope de horas semanales (Profesor)">
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
        <Field label="Nueva contraseña (dejar en blanco para no cambiar)">
          <Input
            type="password"
            placeholder="••••••••"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </Field>
        <Field label="Teléfono">
          <Input
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
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
