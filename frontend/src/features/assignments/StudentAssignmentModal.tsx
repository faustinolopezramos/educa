import { useState, useRef } from "react";
import { Badge, Button, Field, Input, Modal, ModalActions } from "../../components/ui";
import { api, apiErrorMessage } from "../../lib/api";
import { formatDateTime } from "../../lib/format";
import { notify } from "../../lib/toast";
import type { Assignment, AssignmentSubmission } from "../../lib/types";

interface StudentAssignmentModalProps {
  assignment: Assignment;
  courseName?: string;
  existingSubmission?: AssignmentSubmission | null;
  onClose: () => void;
  onSubmitted: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function StudentAssignmentModal({
  assignment,
  courseName,
  existingSubmission,
  onClose,
  onSubmitted,
}: StudentAssignmentModalProps) {
  const [activeTab, setActiveTab] = useState<"file" | "text" | "link">("file");
  const [content, setContent] = useState(existingSubmission?.content || "");
  const [submissionUrl, setSubmissionUrl] = useState(existingSubmission?.submission_url || "");
  const [attachedFile, setAttachedFile] = useState<{
    name: string;
    size: number;
    type: string;
  } | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [isDragging, setIsDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isGraded = existingSubmission?.status === "graded";
  const isPastDue =
    assignment.due_date && new Date(assignment.due_date).getTime() < Date.now();

  function handleFileSelect(file: File) {
    setAttachedFile({
      name: file.name,
      size: file.size,
      type: file.type || "application/octet-stream",
    });
    setUploadProgress(15);

    // Smooth simulated upload progress
    const timer = setInterval(() => {
      setUploadProgress((prev) => {
        if (prev >= 100) {
          clearInterval(timer);
          return 100;
        }
        return prev + 30;
      });
    }, 70);

    const prettySize = formatBytes(file.size);
    setContent(`Documento adjunto: ${file.name} (${prettySize})`);
    setSubmissionUrl(`attachment://${encodeURIComponent(file.name)}`);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave() {
    setIsDragging(false);
  }

  function removeAttachedFile() {
    setAttachedFile(null);
    setUploadProgress(0);
    setContent("");
    setSubmissionUrl("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSubmit() {
    if (!content.trim() && !submissionUrl.trim() && !attachedFile) {
      notify("Agrega un archivo, texto o enlace para tu entrega", "error");
      return;
    }

    setSaving(true);
    try {
      await api.post(`/assignments/${assignment.id}/submissions`, {
        content: content.trim() || null,
        submission_url: submissionUrl.trim() || null,
      });
      notify("Tarea entregada correctamente", "success");
      onSubmitted();
      onClose();
    } catch (err) {
      notify(apiErrorMessage(err, "Error al entregar la tarea"), "error");
    } finally {
      setSaving(false);
    }
  }

  function getScoreBadge(score: number) {
    if (score >= 9) return <Badge color="green">Sobresaliente</Badge>;
    if (score >= 7) return <Badge color="indigo">Aprobado</Badge>;
    return <Badge color="amber">Requiere Refuerzo</Badge>;
  }

  const hasDeliverable = Boolean(
    attachedFile || content.trim() || submissionUrl.trim()
  );

  return (
    <Modal
      title={
        isGraded
          ? "Resultado y Retroalimentación"
          : existingSubmission
          ? "Detalle de tu Entrega"
          : "Entrega de Tarea"
      }
      description={`${assignment.title} · ${courseName || "Curso"}`}
      onClose={onClose}
      onSubmit={!isGraded ? handleSubmit : undefined}
      maxWidth="max-w-2xl"
      footer={
        <ModalActions
          hint={
            isGraded
              ? "Esta tarea ya ha sido evaluada y cerrada por el docente."
              : "Verifica que tu archivo o enlace esté listo antes de presionar enviar."
          }
        >
          <Button variant="secondary" onClick={onClose}>
            {isGraded ? "Cerrar" : "Cancelar"}
          </Button>
          {!isGraded && (
            <Button
              type="submit"
              disabled={saving || !hasDeliverable}
            >
              {saving
                ? "Enviando…"
                : existingSubmission
                ? "Actualizar Entrega"
                : "Enviar Tarea"}
            </Button>
          )}
        </ModalActions>
      }
    >
      <div className="space-y-4">
        {/* Pedagogical Feedback Section (When Graded) */}
        {isGraded && existingSubmission && (
          <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/70 p-4.5 text-emerald-950 shadow-2xs">
            <div className="flex items-center justify-between border-b border-emerald-200/60 pb-3">
              <div>
                <span className="text-2xs font-bold uppercase tracking-wider text-emerald-800">
                  Calificación Obtenida
                </span>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <span className="text-3xl font-extrabold text-emerald-950 tabular">
                    {existingSubmission.score}
                  </span>
                  <span className="text-sm font-semibold text-emerald-700">/ 10</span>
                </div>
              </div>
              <div className="text-right">
                {existingSubmission.score !== null && getScoreBadge(existingSubmission.score)}
                <div className="text-2xs text-emerald-700 mt-1">Revisado por el docente</div>
              </div>
            </div>

            {existingSubmission.feedback ? (
              <div className="mt-3.5 space-y-1">
                <span className="text-2xs font-bold uppercase tracking-wider text-emerald-900 block">
                  Comentarios del Profesor
                </span>
                <p className="rounded-lg bg-white/70 p-3 text-xs leading-relaxed text-slate-800 italic border border-emerald-100">
                  “{existingSubmission.feedback}”
                </p>
              </div>
            ) : (
              <p className="mt-2 text-xs italic text-emerald-800">
                El docente asignó la calificación sin comentarios adicionales.
              </p>
            )}
          </div>
        )}

        {/* Existing Submission Receipt Banner */}
        {existingSubmission && !isGraded && (
          <div className="rounded-xl border border-indigo-200/70 bg-indigo-50/50 p-3.5 text-xs text-indigo-950 flex items-center justify-between">
            <div>
              <div className="font-semibold flex items-center gap-1.5">
                <span>✓ Comprobante de entrega registrado</span>
              </div>
              <div className="text-2xs text-indigo-700 mt-0.5">
                Recibido el {formatDateTime(existingSubmission.submitted_at)}
              </div>
            </div>
            <Badge color={existingSubmission.is_late ? "amber" : "indigo"}>
              {existingSubmission.is_late ? "Entregado fuera de plazo" : "Entregado a tiempo"}
            </Badge>
          </div>
        )}

        {/* Deadline & Warning Bar */}
        {isPastDue && !existingSubmission && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 flex items-center gap-2">
            <span>⚠️</span>
            <span>La fecha límite ya expiró. La entrega se registrará como fuera de plazo.</span>
          </div>
        )}

        {/* Task Instructions & Attachments */}
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-2xs font-bold uppercase tracking-wider text-slate-500">
              Instrucciones de la Asignación
            </span>
            <span className="text-2xs font-semibold text-slate-600">
              {assignment.due_date
                ? `📅 Límite: ${formatDateTime(assignment.due_date)}`
                : "Sin fecha límite"}
            </span>
          </div>

          <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">
            {assignment.description || "El docente no especificó instrucciones adicionales."}
          </p>

          {assignment.resource_url && (
            <div className="pt-2 border-t border-slate-200/60 flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-600">Material de apoyo:</span>
              <a
                href={assignment.resource_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-medium text-brand-600 hover:underline inline-flex items-center gap-1"
              >
                📎 Ver documento adjunto ↗
              </a>
            </div>
          )}
        </div>

        {/* Delivery Form (Only active if not graded) */}
        {!isGraded ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800">
                Tu Entregable
              </label>
              <div className="flex rounded-md bg-slate-100 p-0.5 text-2xs font-semibold">
                <button
                  type="button"
                  onClick={() => setActiveTab("file")}
                  className={`rounded px-2.5 py-1 transition ${
                    activeTab === "file"
                      ? "bg-white text-slate-900 shadow-2xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  📄 Archivo / Dropzone
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("text")}
                  className={`rounded px-2.5 py-1 transition ${
                    activeTab === "text"
                      ? "bg-white text-slate-900 shadow-2xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  📝 Texto en Línea
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("link")}
                  className={`rounded px-2.5 py-1 transition ${
                    activeTab === "link"
                      ? "bg-white text-slate-900 shadow-2xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  🔗 Enlace Externo
                </button>
              </div>
            </div>

            {/* TAB 1: FILE DRAG & DROP ZONE */}
            {activeTab === "file" && (
              <div className="space-y-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx,.zip,.png,.jpg,.jpeg"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleFileSelect(e.target.files[0]);
                    }
                  }}
                />

                {!attachedFile ? (
                  <div
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onClick={() => fileInputRef.current?.click()}
                    className={`cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition-all ${
                      isDragging
                        ? "border-brand-500 bg-brand-50/60 scale-[1.01]"
                        : "border-slate-300 hover:border-brand-400 hover:bg-slate-50"
                    }`}
                  >
                    <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                      📄
                    </div>
                    <p className="mt-2 text-xs font-semibold text-slate-800">
                      Arrastra tu archivo aquí o haz clic para explorar
                    </p>
                    <p className="mt-1 text-2xs text-slate-400">
                      Soporta PDF, DOCX, ZIP o imágenes (hasta 25 MB)
                    </p>
                  </div>
                ) : (
                  <div className="rounded-xl border border-brand-200 bg-brand-50/40 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white font-bold text-xs">
                          PDF
                        </div>
                        <div>
                          <div className="text-xs font-bold text-slate-900">
                            {attachedFile.name}
                          </div>
                          <div className="text-2xs text-slate-500">
                            {formatBytes(attachedFile.size)} · Documento listo
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={removeAttachedFile}
                        className="text-xs font-medium text-red-600 hover:text-red-700"
                      >
                        Quitar
                      </button>
                    </div>

                    {uploadProgress < 100 ? (
                      <div className="space-y-1">
                        <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-brand-600 transition-all duration-200"
                            style={{ width: `${uploadProgress}%` }}
                          />
                        </div>
                        <div className="text-right text-2xs text-slate-500 font-mono">
                          Procesando {uploadProgress}%
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-2xs font-semibold text-emerald-700">
                        <span>✓</span>
                        <span>Archivo verificado y listo para entrega</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: TEXT RESPONSE */}
            {activeTab === "text" ? (
              <Field label="Desarrollo del trabajo o texto">
                <textarea
                  rows={5}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                  placeholder="Escribe tu respuesta, resolución de preguntas o resumen aquí…"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  disabled={saving}
                />
              </Field>
            ) : null}

            {/* TAB 3: CLOUD LINK */}
            {activeTab === "link" ? (
              <div className="space-y-3">
                <Field label="Enlace del documento o proyecto">
                  <Input
                    placeholder="https://drive.google.com/... o https://github.com/..."
                    value={submissionUrl}
                    onChange={(e) => setSubmissionUrl(e.target.value)}
                    disabled={saving}
                  />
                </Field>
                <p className="text-2xs text-slate-500">
                  Asegúrate de que los permisos de lectura de tu archivo en Google Drive o enlace estén abiertos para que el profesor pueda revisarlo.
                </p>
              </div>
            ) : null}
          </div>
        ) : (
          /* Read-only view of student's submission when already graded */
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 space-y-2 text-xs">
            <span className="text-2xs font-bold uppercase tracking-wider text-slate-500">
              Tu Trabajo Enviado
            </span>
            {existingSubmission.content && (
              <div className="rounded-md bg-white p-3 border border-slate-200 text-slate-800 leading-relaxed whitespace-pre-wrap">
                {existingSubmission.content}
              </div>
            )}
            {existingSubmission.submission_url && (
              <div className="pt-1">
                <a
                  href={existingSubmission.submission_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-600 hover:underline font-medium inline-flex items-center gap-1"
                >
                  🔗 Ver tu archivo entregado ({existingSubmission.submission_url}) ↗
                </a>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
