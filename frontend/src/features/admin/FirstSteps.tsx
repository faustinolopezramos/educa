import { useState } from "react";
import { useSearchParams } from "react-router-dom";

import { Button, Card } from "../../components/ui";
import { IconCheck } from "../../components/icons";
import type { SetupStep } from "../../lib/types";
import { api } from "../../lib/api";
import { queryClient } from "../../lib/queryClient";
import { StudentBulkImportModal } from "./StudentBulkImportModal";

/**
 * Primeros pasos de una academia nueva en su panel de administración.
 *
 * Guía interactiva paso a paso para el Día 1 del Director:
 * - Detección automática del estado en tiempo real.
 * - Acceso directo al Importador Masivo CSV (P1).
 * - Carga en 1 clic de plantillas curriculares estándar (Inglés o Habilidades Digitales).
 * - Modo minimizado para explorar el panel sin perder el progreso.
 */
export function FirstSteps({ steps }: { steps: SetupStep[] }) {
  const [, setParams] = useSearchParams();
  const [isMinimized, setIsMinimized] = useState<boolean>(false);
  const [showBulkImport, setShowBulkImport] = useState<boolean>(false);
  const [isApplyingTemplate, setIsApplyingTemplate] = useState<boolean>(false);
  const [templateNotice, setTemplateNotice] = useState<string | null>(null);

  const done = steps.filter((s) => s.done).length;
  const next = steps.find((s) => !s.done);
  if (!next) return null;

  const pct = Math.round((done / steps.length) * 100);

  async function handleApplyTemplate(type: "english" | "digital_skills") {
    setIsApplyingTemplate(true);
    setTemplateNotice(null);
    try {
      const res = await api.post<{ status: string; message: string }>(
        "/catalog/quick-setup-template",
        null,
        { params: { template_type: type } }
      );
      setTemplateNotice(res.data.message);
      // Invalidate queries so the wizard and catalog automatically refresh
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      await queryClient.invalidateQueries({ queryKey: ["languages"] });
      await queryClient.invalidateQueries({ queryKey: ["levels"] });
    } catch {
      setTemplateNotice("No se pudo cargar la plantilla. Intenta crear el área manualmente.");
    } finally {
      setIsApplyingTemplate(false);
    }
  }

  const categoryTag = (key: string) => {
    switch (key) {
      case "areas":
      case "levels":
        return "📚 Catálogo";
      case "teachers":
        return "👩‍🏫 Docentes";
      case "courses":
      case "open":
        return "🗓️ Cursos";
      case "students":
        return "🎓 Alumnos";
      case "enroll":
        return "📝 Matrículas";
      default:
        return "⚡ Academia";
    }
  };

  return (
    <>
      <Card className="mb-4 border-brand-200">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-900">Pon en marcha tu academia</h2>
            <p className="text-sm text-slate-500">
              Siete pasos hasta tu primera clase. Puedes volver aquí cuando quieras.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="tabular text-xs font-semibold text-slate-500">
              {done} de {steps.length}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsMinimized(!isMinimized)}
              className="text-xs text-slate-500 hover:text-slate-800"
            >
              {isMinimized ? "Expandir" : "Minimizar"}
            </Button>
          </div>
        </div>

        <div
          className="mb-4 h-1.5 overflow-hidden rounded-full bg-slate-100"
          role="progressbar"
          aria-valuenow={done}
          aria-valuemin={0}
          aria-valuemax={steps.length}
          aria-label="Pasos completados"
        >
          <div
            className="h-full rounded-full bg-brand-500 transition-all duration-500"
            style={{ width: `${(done / steps.length) * 100}%` }}
          />
        </div>

        {/* Minimized View */}
        {isMinimized && (
          <div className="flex items-center justify-between rounded-lg bg-stone-50 p-2.5 text-xs text-slate-600">
            <div>
              <span className="font-bold text-brand-700">{pct}% completado</span> • Próximo paso:{" "}
              <span className="font-semibold text-slate-800">{next.label}</span>
            </div>
            <Button size="sm" onClick={() => setIsMinimized(false)}>
              Continuar guía
            </Button>
          </div>
        )}

        {/* Expanded View */}
        {!isMinimized && (
          <>
            {/* Quick Template Helper for Areas/Levels */}
            {(next.key === "areas" || next.key === "levels") && (
              <div className="mb-4 rounded-xl border border-brand-200 bg-brand-50/60 p-3.5 text-xs text-slate-700">
                <div className="font-bold text-brand-900 flex items-center gap-1.5">
                  <span>⚡ ¿Quieres ahorrar tiempo en la configuración?</span>
                </div>
                <p className="mt-1 text-slate-600">
                  Carga en 1 clic una estructura curricular recomendada con sus niveles estándar:
                </p>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={isApplyingTemplate}
                    onClick={() => handleApplyTemplate("english")}
                  >
                    {isApplyingTemplate ? "Cargando…" : "🇬🇧 Cargar Inglés (A1 a B2)"}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={isApplyingTemplate}
                    onClick={() => handleApplyTemplate("digital_skills")}
                  >
                    {isApplyingTemplate ? "Cargando…" : "💻 Cargar Habilidades Digitales"}
                  </Button>
                </div>
                {templateNotice && (
                  <p className="mt-2 text-xs font-semibold text-emerald-800">
                    ✓ {templateNotice}
                  </p>
                )}
              </div>
            )}

            <ol className="space-y-1.5">
              {steps.map((step, i) => {
                const isNext = step === next;
                return (
                  <li
                    key={step.key}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 transition ${
                      isNext ? "bg-brand-50 border border-brand-200/60 shadow-xs" : ""
                    }`}
                  >
                    <span
                      className={`flex h-6 w-6 flex-none items-center justify-center rounded-full text-xs font-bold ${
                        step.done
                          ? "bg-emerald-100 text-emerald-700"
                          : isNext
                            ? "bg-brand-600 text-white"
                            : "bg-slate-100 text-slate-500"
                      }`}
                      aria-hidden="true"
                    >
                      {step.done ? <IconCheck className="h-3.5 w-3.5" /> : i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-semibold text-slate-400">
                          {categoryTag(step.key)}
                        </span>
                        <p
                          className={`text-sm font-semibold ${
                            step.done ? "text-slate-400 line-through" : "text-slate-900"
                          }`}
                        >
                          {step.label}
                          {step.done && <span className="sr-only"> (hecho)</span>}
                        </p>
                      </div>
                      {isNext && <p className="text-xs text-slate-600 mt-0.5">{step.hint}</p>}
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Secondary action: Direct Bulk Import if next is students */}
                      {isNext && step.key === "students" && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setShowBulkImport(true)}
                        >
                          📥 Importar CSV
                        </Button>
                      )}

                      {/* Primary Empezar action */}
                      {isNext && (
                        <Button size="sm" onClick={() => setParams({ m: step.section })}>
                          Empezar
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </>
        )}
      </Card>

      {/* Direct Bulk Import Modal from Setup Wizard */}
      {showBulkImport && (
        <StudentBulkImportModal
          onClose={() => setShowBulkImport(false)}
          onSuccess={() => {
            setShowBulkImport(false);
            void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
            void queryClient.invalidateQueries({ queryKey: ["users"] });
          }}
        />
      )}
    </>
  );
}
