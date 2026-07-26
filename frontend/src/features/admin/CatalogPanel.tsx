import { useState } from "react";

import { Badge, Button, Card, Input, Select } from "../../components/ui";
import {
  useCreateLanguage,
  useCreateLevel,
  useCreateNationality,
  useDeleteLanguage,
  useDeleteLevel,
  useDeleteNationality,
  useLanguages,
  useLevels,
  useNationalities,
} from "../../lib/queries";
import type { TrackKind } from "../../lib/types";
import { onMutationError } from "./shared";

const TRACK_LABELS: Record<TrackKind, string> = {
  language: "Idiomas",
  digital_skill: "Competencias Digitales",
  business_skill: "Competencias de Negocios",
};
const TRACK_ORDER: TrackKind[] = ["language", "digital_skill", "business_skill"];

export function CatalogPanel() {
  const { data: languages = [] } = useLanguages();
  const { data: levels = [] } = useLevels();
  const createLang = useCreateLanguage();
  const delLang = useDeleteLanguage();
  const createLevel = useCreateLevel();
  const delLevel = useDeleteLevel();
  const [langName, setLangName] = useState("");
  const [langKind, setLangKind] = useState<TrackKind>("language");
  const [level, setLevel] = useState({ language_id: 0, code: "", name: "" });

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <h3 className="mb-3 font-medium">Catálogo académico</h3>
        <div className="mb-4 flex gap-2">
          <Input
            placeholder="Ej. Inglés, Marketing Digital…"
            value={langName}
            onChange={(e) => setLangName(e.target.value)}
          />
          <Select
            className="max-w-[11rem]"
            value={langKind}
            onChange={(e) => setLangKind(e.target.value as TrackKind)}
          >
            {TRACK_ORDER.map((k) => (
              <option key={k} value={k}>
                {TRACK_LABELS[k]}
              </option>
            ))}
          </Select>
          <Button
            onClick={() =>
              langName &&
              createLang.mutate(
                { name: langName, kind: langKind },
                {
                  onSuccess: () => setLangName(""),
                  onError: onMutationError("No se pudo crear"),
                },
              )
            }
          >
            Añadir
          </Button>
        </div>
        <div className="space-y-4">
          {TRACK_ORDER.map((kind) => {
            const group = languages.filter((l) => l.kind === kind);
            if (group.length === 0) return null;
            return (
              <div key={kind}>
                <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {TRACK_LABELS[kind]}
                </h4>
                <ul className="space-y-1 text-sm">
                  {group.map((l) => (
                    <li
                      key={l.id}
                      className="flex items-center justify-between rounded bg-slate-50 px-3 py-1.5"
                    >
                      {l.name}
                      <Button
                        variant="ghost"
                        onClick={() =>
                          delLang.mutate(l.id, {
                            onError: onMutationError(
                              "No se pudo eliminar (¿tiene niveles?)",
                            ),
                          })
                        }
                      >
                        ✕
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </Card>
      <Card>
        <h3 className="mb-3 font-medium">Niveles / Módulos</h3>
        <div className="mb-4 space-y-2">
          <Select
            value={level.language_id}
            onChange={(e) =>
              setLevel({ ...level, language_id: Number(e.target.value) })
            }
          >
            <option value={0}>Selecciona idioma o competencia…</option>
            {languages.map((l) => (
              <option key={l.id} value={l.id}>
                {TRACK_LABELS[l.kind]} · {l.name}
              </option>
            ))}
          </Select>
          <div className="flex gap-2">
            <Input
              placeholder="Código (A1, Módulo 1…)"
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
            Añadir nivel/módulo
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
      <NationalitiesCard />
    </div>
  );
}

function NationalitiesCard() {
  const { data: nationalities = [] } = useNationalities();
  const createNat = useCreateNationality();
  const delNat = useDeleteNationality();
  const [name, setName] = useState("");

  return (
    <Card>
      <h3 className="mb-3 font-medium">Nacionalidades</h3>
      <div className="mb-4 flex gap-2">
        <Input
          placeholder="Ej. Guatemala"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Button
          onClick={() =>
            name &&
            createNat.mutate(name, {
              onSuccess: () => setName(""),
              onError: onMutationError("No se pudo crear"),
            })
          }
        >
          Añadir
        </Button>
      </div>
      <ul className="grid grid-cols-2 gap-1 text-sm">
        {nationalities.map((n) => (
          <li
            key={n.id}
            className="flex items-center justify-between rounded bg-slate-50 px-3 py-1.5"
          >
            {n.name}
            <Button
              variant="ghost"
              onClick={() =>
                delNat.mutate(n.id, {
                  onError: onMutationError("No se pudo eliminar"),
                })
              }
            >
              ✕
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
