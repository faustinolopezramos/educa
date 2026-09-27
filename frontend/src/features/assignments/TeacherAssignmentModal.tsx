import { useState } from "react";
import { Button, Field, Input, Modal, ModalActions, Select } from "../../components/ui";
import { api, apiErrorMessage } from "../../lib/api";
import { notify } from "../../lib/toast";
import type { Course } from "../../lib/types";

interface TeacherAssignmentModalProps {
  courses: Course[];
  initialCourseId?: number;
  onClose: () => void;
  onCreated: () => void;
}

export function TeacherAssignmentModal({
  courses,
  initialCourseId,
  onClose,
  onCreated,
}: TeacherAssignmentModalProps) {
  const [courseId, setCourseId] = useState<number>(
    initialCourseId || (courses.length > 0 ? courses[0].id : 0)
  );
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [resourceUrl, setResourceUrl] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [datePreset, setDatePreset] = useState<"custom" | "3d" | "weekend" | "7d">("custom");
  const [saving, setSaving] = useState(false);

  function applyDatePreset(preset: "3d" | "weekend" | "7d") {
    setDatePreset(preset);
    const now = new Date();
    let target = new Date();

    if (preset === "3d") {
      target.setDate(now.getDate() + 3);
      target.setHours(23, 59, 0, 0);
    } else if (preset === "weekend") {
      const day = now.getDay();
      const diffToSunday = (7 - day) % 7 || 7;
      target.setDate(now.getDate() + diffToSunday);
      target.setHours(23, 59, 0, 0);
    } else if (preset === "7d") {
      target.setDate(now.getDate() + 7);
      target.setHours(23, 59, 0, 0);
    }

    // Format to YYYY-MM-DDTHH:mm for datetime-local input
    const pad = (n: number) => n.toString().padStart(2, "0");
    const formatted = `${target.getFullYear()}-${pad(target.getMonth() + 1)}-${pad(
      target.getDate()
    )}T${pad(target.getHours())}:${pad(target.getMinutes())}`;
    setDueDate(formatted);
  }

  async function handleCreate() {
    if (!title.trim()) {
      notify("Ingresa un título para la tarea", "error");
      return;
    }
    if (!courseId) {
      notify("Selecciona un curso válido", "error");
      return;
    }

    let formattedDueDate: string | null = null;
    if (dueDate) {
      const parsed = new Date(dueDate);
      if (!isNaN(parsed.getTime())) {
        formattedDueDate = parsed.toISOString();
      }
    }

    setSaving(true);
    try {
      await api.post("/assignments", {
        course_id: courseId,
        title: title.trim(),
        description: description.trim() || null,
        resource_url: resourceUrl.trim() || null,
        due_date: formattedDueDate,
      });
      notify("Tarea publicada con éxito", "success");
      onCreated();
      onClose();
    } catch (err) {
      notify(apiErrorMessage(err, "Error al crear la tarea"), "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Crear Nueva Tarea"
      description="Los estudiantes matriculados recibirán la tarea en su panel al instante."
      onClose={onClose}
      onSubmit={handleCreate}
      maxWidth="max-w-xl"
      footer={
        <ModalActions>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saving || !title.trim()}>
            {saving ? "Publicando…" : "Publicar Tarea"}
          </Button>
        </ModalActions>
      }
    >
      <div className="space-y-4">
        <Field label="Curso / Grupo" required>
          <Select
            value={courseId}
            onChange={(e) => setCourseId(Number(e.target.value))}
            disabled={saving}
          >
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Título de la Asignación" required>
          <Input
            placeholder="Ej. Ensayo argumentativo: Impacto de la IA"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={saving}
            autoFocus
          />
        </Field>

        <Field label="Instrucciones y Pautas">
          <textarea
            rows={4}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 disabled:bg-slate-50"
            placeholder="Detalla qué deben hacer los alumnos, extensión requerida o criterios clave…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={saving}
          />
        </Field>

        <Field label="Fecha y Hora Límite">
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => applyDatePreset("3d")}
                className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                  datePreset === "3d"
                    ? "bg-brand-600 text-white shadow-xs"
                    : "border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
                }`}
              >
                ⚡ En 3 días
              </button>
              <button
                type="button"
                onClick={() => applyDatePreset("weekend")}
                className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                  datePreset === "weekend"
                    ? "bg-brand-600 text-white shadow-xs"
                    : "border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
                }`}
              >
                📅 Fin de semana
              </button>
              <button
                type="button"
                onClick={() => applyDatePreset("7d")}
                className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                  datePreset === "7d"
                    ? "bg-brand-600 text-white shadow-xs"
                    : "border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
                }`}
              >
                🗓️ En 7 días
              </button>
            </div>
            <Input
              type="datetime-local"
              value={dueDate}
              onChange={(e) => {
                setDueDate(e.target.value);
                setDatePreset("custom");
              }}
              disabled={saving}
            />
          </div>
        </Field>

        <Field label="Recurso o Enlace de Apoyo (Opcional)">
          <Input
            placeholder="Ej. https://drive.google.com/..."
            value={resourceUrl}
            onChange={(e) => setResourceUrl(e.target.value)}
            disabled={saving}
          />
        </Field>
      </div>
    </Modal>
  );
}
