import { useState } from "react";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Field,
  Input,
  Modal,
  ModalActions,
  Select,
} from "../../components/ui";
import {
  useCreateLanguage,
  useCreateLevel,
  useDeleteLanguage,
  useDeleteLevel,
  useLanguages,
  useLevels,
} from "../../lib/queries";
import { notify } from "../../lib/toast";
import type { Language, Level, TrackKind } from "../../lib/types";
import { onMutationError } from "./shared";

const TRACK_LABELS: Record<TrackKind, string> = {
  language: "Idiomas",
  digital_skill: "Competencias Digitales",
  business_skill: "Competencias de Negocios",
};

const TRACK_BADGE_COLORS: Record<TrackKind, "indigo" | "green" | "amber"> = {
  language: "indigo",
  digital_skill: "green",
  business_skill: "amber",
};

const TRACK_ORDER: TrackKind[] = ["language", "digital_skill", "business_skill"];

export function CatalogPanel() {
  const { data: languages = [] } = useLanguages();
  const { data: levels = [] } = useLevels();

  const createLang = useCreateLanguage();
  const delLang = useDeleteLanguage();
  const createLevel = useCreateLevel();
  const delLevel = useDeleteLevel();

  const [activeTab, setActiveTab] = useState<TrackKind | "all">("all");

  // Modals state
  const [showAddLangModal, setShowAddLangModal] = useState(false);
  const [showAddLevelModal, setShowAddLevelModal] = useState(false);

  // Form states
  const [langName, setLangName] = useState("");
  const [langKind, setLangKind] = useState<TrackKind>("language");

  const [selectedLangForLevel, setSelectedLangForLevel] = useState<number>(0);
  const [levelCode, setLevelCode] = useState("");
  const [levelName, setLevelName] = useState("");

  const [toDeleteLang, setToDeleteLang] = useState<Language | null>(null);
  const [toDeleteLevel, setToDeleteLevel] = useState<Level | null>(null);

  const filteredLanguages = languages.filter((l) => {
    if (activeTab !== "all" && l.kind !== activeTab) return false;
    return true;
  });

  function handleCreateLanguage() {
    if (!langName.trim()) return;
    createLang.mutate(
      { name: langName.trim(), kind: langKind },
      {
        onSuccess: () => {
          setLangName("");
          setShowAddLangModal(false);
          notify("Materia / Idioma agregado al catálogo", "success");
        },
        onError: onMutationError("No se pudo agregar la materia"),
      }
    );
  }

  function handleCreateLevel() {
    if (!selectedLangForLevel || !levelCode.trim()) return;
    createLevel.mutate(
      {
        language_id: selectedLangForLevel,
        code: levelCode.trim(),
        name: levelName.trim() || levelCode.trim(),
      },
      {
        onSuccess: () => {
          setLevelCode("");
          setLevelName("");
          setShowAddLevelModal(false);
          notify("Nivel / Módulo agregado al catálogo", "success");
        },
        onError: onMutationError("No se pudo agregar el nivel"),
      }
    );
  }

  function openLevelModal(languageId?: number) {
    if (languageId) setSelectedLangForLevel(languageId);
    else if (languages.length > 0) setSelectedLangForLevel(languages[0].id);
    setShowAddLevelModal(true);
  }

  return (
    <div className="space-y-4">
      {/* Ultra-Clean Header Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600 font-bold text-lg">
            🌐
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-serif text-xl font-bold text-slate-900">
                Estructura e Idiomas
              </h2>
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                {languages.length} materias
              </span>
            </div>
            <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500">
              <span>🏷️ {levels.length} niveles configurados en catálogo</span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            className="text-xs font-semibold !py-1.5 !px-3"
            onClick={() => openLevelModal()}
          >
            🏷️ + Nuevo Nivel
          </Button>
          <Button
            className="bg-brand-600 hover:bg-brand-700 text-white font-semibold text-xs py-2 px-3.5 shadow-2xs"
            onClick={() => setShowAddLangModal(true)}
          >
            + Nueva Materia
          </Button>
        </div>
      </div>

      {/* Category Filter Tabs */}
      <div className="flex items-center justify-between bg-white p-2.5 rounded-2xl border border-slate-200/80 shadow-2xs text-xs">
        <div className="flex items-center space-x-1 overflow-x-auto">
          <button
            onClick={() => setActiveTab("all")}
            className={`rounded-lg px-3 py-1.5 font-semibold transition ${
              activeTab === "all"
                ? "bg-slate-900 text-white shadow-2xs"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            Todas ({languages.length})
          </button>
          {TRACK_ORDER.map((kind) => {
            const count = languages.filter((l) => l.kind === kind).length;
            return (
              <button
                key={kind}
                onClick={() => setActiveTab(kind)}
                className={`rounded-lg px-3 py-1.5 font-semibold transition ${
                  activeTab === kind
                    ? "bg-slate-900 text-white shadow-2xs"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {TRACK_LABELS[kind]} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Catalog Cards Grid */}
      {filteredLanguages.length === 0 ? (
        <Card className="p-8 text-center text-slate-400 text-xs italic">
          No hay materias registradas en esta categoría.
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredLanguages.map((lang) => {
            const langLevels = levels.filter((lvl) => lvl.language_id === lang.id);

            return (
              <Card
                key={lang.id}
                className="flex flex-col justify-between p-4 border border-slate-200/80 rounded-2xl bg-white shadow-2xs hover:border-slate-300 transition space-y-3"
              >
                <div>
                  {/* Header: Track badge & Delete */}
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <Badge color={TRACK_BADGE_COLORS[lang.kind]}>
                      {TRACK_LABELS[lang.kind]}
                    </Badge>
                    <button
                      type="button"
                      onClick={() => setToDeleteLang(lang)}
                      className="text-slate-300 hover:text-red-600 text-xs font-bold p-1 transition"
                      title="Eliminar materia"
                    >
                      ✕
                    </button>
                  </div>

                  <h3 className="font-semibold text-base text-slate-900">
                    {lang.name}
                  </h3>

                  {/* Levels List */}
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-medium text-slate-400">
                        Niveles ({langLevels.length})
                      </span>
                      <button
                        type="button"
                        onClick={() => openLevelModal(lang.id)}
                        className="font-semibold text-brand-600 hover:text-brand-700 hover:underline"
                      >
                        + Agregar Nivel
                      </button>
                    </div>

                    {langLevels.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-2.5 text-center text-slate-400 text-[11px] italic">
                        Sin niveles definidos aún.
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {langLevels.map((lvl) => (
                          <div
                            key={lvl.id}
                            className="flex items-center justify-between rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs border border-slate-100/80"
                          >
                            <div className="flex items-center space-x-2">
                              <span className="font-bold text-brand-700 bg-brand-50 px-1.5 py-0.2 rounded text-[11px]">
                                {lvl.code}
                              </span>
                              <span className="font-medium text-slate-700">
                                {lvl.name}
                              </span>
                            </div>

                            <button
                              type="button"
                              onClick={() => setToDeleteLevel(lvl)}
                              className="text-slate-300 hover:text-red-600 text-xs font-bold transition px-1"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Modal 1: Crear Nueva Materia / Idioma */}
      {showAddLangModal && (
        <Modal
          title="Nueva materia o programa"
          description="Es el contenedor de los niveles: Inglés, Python, Liderazgo…"
          onClose={() => setShowAddLangModal(false)}
          onSubmit={handleCreateLanguage}
          footer={
            <ModalActions>
              <Button variant="secondary" onClick={() => setShowAddLangModal(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={!langName.trim() || createLang.isPending}>
                {createLang.isPending ? "Guardando…" : "Guardar materia"}
              </Button>
            </ModalActions>
          }
        >
          <div className="space-y-3.5 text-xs">
            <Field label="Nombre de Asignatura (*)">
              <Input
                placeholder="Ej. Francés, Python, Liderazgo…"
                value={langName}
                onChange={(e) => setLangName(e.target.value)}
              />
            </Field>

            <Field label="Área / Tipo de Programa">
              <Select
                value={langKind}
                onChange={(e) => setLangKind(e.target.value as TrackKind)}
              >
                {TRACK_ORDER.map((k) => (
                  <option key={k} value={k}>
                    {TRACK_LABELS[k]}
                  </option>
                ))}
              </Select>
            </Field>

          </div>
        </Modal>
      )}

      {/* Modal 2: Crear Nuevo Nivel Académico */}
      {showAddLevelModal && (
        <Modal
          title="Nuevo nivel o módulo"
          description="Un peldaño dentro de una materia — A1, Mód. 2 — sobre el que se crean los cursos."
          onClose={() => setShowAddLevelModal(false)}
          onSubmit={handleCreateLevel}
          footer={
            <ModalActions>
              <Button variant="secondary" onClick={() => setShowAddLevelModal(false)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={!selectedLangForLevel || !levelCode.trim() || createLevel.isPending}
              >
                {createLevel.isPending ? "Guardando…" : "Guardar nivel"}
              </Button>
            </ModalActions>
          }
        >
          <div className="space-y-3.5 text-xs">
            <Field label="Materia / Idioma (*)">
              <Select
                value={selectedLangForLevel}
                onChange={(e) => setSelectedLangForLevel(Number(e.target.value))}
              >
                <option value={0}>Selecciona materia…</option>
                {languages.map((l) => (
                  <option key={l.id} value={l.id}>
                    {TRACK_LABELS[l.kind]} · {l.name}
                  </option>
                ))}
              </Select>
            </Field>

            <div className="grid gap-3 grid-cols-2">
              <Field label="Código Nivel (*)">
                <Input
                  placeholder="Ej. A1, Mód. 1"
                  value={levelCode}
                  onChange={(e) => setLevelCode(e.target.value)}
                />
              </Field>

              <Field label="Nombre descriptivo">
                <Input
                  placeholder="Ej. Principiante"
                  value={levelName}
                  onChange={(e) => setLevelName(e.target.value)}
                />
              </Field>
            </div>

          </div>
        </Modal>
      )}

      {/* Delete Confirmations */}
      {toDeleteLang && (
        <ConfirmDialog
          title="¿Eliminar esta materia del catálogo?"
          confirmLabel="Sí, eliminar"
          message={
            <p className="text-xs text-slate-600">
              Vas a eliminar <strong>{toDeleteLang.name}</strong> y sus grados asociados.
            </p>
          }
          onClose={() => setToDeleteLang(null)}
          onConfirm={() => {
            delLang.mutate(toDeleteLang.id, {
              onSuccess: () => {
                setToDeleteLang(null);
                notify("Materia eliminada del catálogo", "success");
              },
              onError: onMutationError("No se pudo eliminar"),
            });
          }}
        />
      )}

      {toDeleteLevel && (
        <ConfirmDialog
          title="¿Eliminar este nivel académico?"
          confirmLabel="Sí, eliminar nivel"
          message={
            <p className="text-xs text-slate-600">
              Vas a eliminar el nivel <strong>{toDeleteLevel.code} · {toDeleteLevel.name}</strong>.
            </p>
          }
          onClose={() => setToDeleteLevel(null)}
          onConfirm={() => {
            delLevel.mutate(toDeleteLevel.id, {
              onSuccess: () => {
                setToDeleteLevel(null);
                notify("Nivel eliminado del catálogo", "success");
              },
              onError: onMutationError("No se pudo eliminar el nivel"),
            });
          }}
        />
      )}
    </div>
  );
}
