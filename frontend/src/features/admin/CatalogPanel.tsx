import { useState } from "react";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  MetaItem,
  Modal,
  ModalActions,
  PageHeader,
  SegmentedControl,
  Select,
} from "../../components/ui";
import { IconClose, IconLayers } from "../../components/icons";
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
    <div>
      <PageHeader
        title="Estructura académica"
        description="Las materias agrupan niveles, y sobre cada nivel se crean los cursos."
        meta={
          <>
            <MetaItem value={languages.length} label="materias" />
            <MetaItem value={levels.length} label="niveles" />
          </>
        }
        actions={
          <>
            <Button variant="secondary" onClick={() => openLevelModal()}>
              Nuevo nivel
            </Button>
            <Button onClick={() => setShowAddLangModal(true)}>Nueva materia</Button>
          </>
        }
      />

      <div className="mb-4">
        <SegmentedControl
          value={activeTab}
          onChange={setActiveTab}
          options={[
            { value: "all" as const, label: "Todas", count: languages.length },
            ...TRACK_ORDER.map((kind) => ({
              value: kind,
              label: TRACK_LABELS[kind],
              count: languages.filter((l) => l.kind === kind).length,
            })),
          ]}
        />
      </div>

      {/* Main Catalog Cards Grid */}
      {filteredLanguages.length === 0 ? (
        <EmptyState
          icon={<IconLayers className="h-5 w-5" />}
          title="No hay materias en esta categoría"
          message="Una materia es el contenedor de los niveles: Inglés, Python, Liderazgo…"
          action={<Button onClick={() => setShowAddLangModal(true)}>Nueva materia</Button>}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredLanguages.map((lang) => {
            const langLevels = levels.filter((lvl) => lvl.language_id === lang.id);

            return (
              <Card key={lang.id} padding="sm" className="flex flex-col">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Badge color={TRACK_BADGE_COLORS[lang.kind]}>
                      {TRACK_LABELS[lang.kind]}
                    </Badge>
                    <h3 className="mt-1.5 truncate text-sm font-bold text-slate-900">
                      {lang.name}
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setToDeleteLang(lang)}
                    className="-mr-1 -mt-1 flex-none rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                    aria-label={`Eliminar la materia ${lang.name}`}
                  >
                    <IconClose className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 text-xs">
                  <span className="text-slate-500">
                    {langLevels.length === 0
                      ? "Sin niveles"
                      : `${langLevels.length} ${langLevels.length === 1 ? "nivel" : "niveles"}`}
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => openLevelModal(lang.id)}>
                    Añadir nivel
                  </Button>
                </div>

                {langLevels.length > 0 && (
                  <ul className="mt-1 space-y-1">
                    {langLevels.map((lvl) => (
                      <li
                        key={lvl.id}
                        className="group flex items-center justify-between gap-2 rounded-lg bg-slate-50 py-1.5 pl-2.5 pr-1.5 text-xs"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="flex-none font-semibold text-brand-700">
                            {lvl.code}
                          </span>
                          <span className="truncate text-slate-600">{lvl.name}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => setToDeleteLevel(lvl)}
                          className="flex-none rounded p-1 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                          aria-label={`Eliminar el nivel ${lvl.code}`}
                        >
                          <IconClose className="h-3 w-3" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
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
          <div className="space-y-4">
            <Field label="Nombre de la materia">
              <Input
                placeholder="Ej. Francés, Python, Liderazgo…"
                value={langName}
                onChange={(e) => setLangName(e.target.value)}
              />
            </Field>

            <Field label="Área">
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
            <Field label="Materia">
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

            <div className="grid grid-cols-2 gap-3">
              <Field label="Código">
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
          title="Eliminar materia"
          confirmLabel="Eliminar materia"
          busy={delLang.isPending}
          message={
            <>
              Se eliminará <strong>{toDeleteLang.name}</strong> y todos sus niveles.
            </>
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
          title="Eliminar nivel"
          confirmLabel="Eliminar nivel"
          busy={delLevel.isPending}
          message={
            <>
              Se eliminará el nivel{" "}
              <strong>
                {toDeleteLevel.code} · {toDeleteLevel.name}
              </strong>
              .
            </>
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
