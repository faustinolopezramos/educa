import { useState } from "react";

import { Badge, Button, Card, Input, Select } from "../../components/ui";
import {
  useCreateLanguage, useCreateLevel, useDeleteLanguage, useDeleteLevel, useLanguages, useLevels,
} from "../../lib/queries";
import { onMutationError } from "./shared";

export function CatalogPanel() {
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
