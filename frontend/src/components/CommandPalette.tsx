import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";
import { NAV } from "../lib/nav";

interface Command {
  id: string;
  label: string;
  /** Where it lives, so a bare word like "Aulas" is not ambiguous. */
  group: string;
  keywords?: string;
  run: () => void;
}

// Every section is one keystroke away instead of a sidebar hunt: ⌘K, type,
// Enter. Roles only ever see their own sections because the list is built from
// the same NAV the sidebar renders.
/** Lets the header's search button open the palette without prop drilling. */
export const OPEN_COMMAND_PALETTE = "educa:open-command-palette";

export function openCommandPalette() {
  document.dispatchEvent(new CustomEvent(OPEN_COMMAND_PALETTE));
}

export function CommandPalette() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    function onOpen() {
      setOpen(true);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener(OPEN_COMMAND_PALETTE, onOpen);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener(OPEN_COMMAND_PALETTE, onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setCursor(0);
      // The input mounts with the overlay, so focus after paint.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const commands = useMemo<Command[]>(() => {
    if (!user) return [];
    const list: Command[] = [];
    for (const group of NAV[user.role] ?? []) {
      for (const item of group.items) {
        list.push({
          id: item.id,
          label: item.label,
          group: group.label,
          run: () => navigate(`/?m=${item.id}`),
        });
      }
    }
    if (user.role === "admin" || user.role === "superadmin") {
      list.push({
        id: "action-enroll",
        label: "Inscribir alumno al curso",
        group: "Acciones",
        keywords: "inscribir inscripcion nueva matricula alumno",
        run: () => navigate("/?m=enrollments&new=1"),
      });
      list.push({
        id: "action-course",
        label: "Crear curso",
        group: "Acciones",
        keywords: "nuevo curso agregar",
        run: () => navigate("/?m=courses&new=1"),
      });
    }
    return list;
  }, [user, navigate]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter(
      (c) =>
        c.label.toLowerCase().includes(q) ||
        c.group.toLowerCase().includes(q) ||
        (c.keywords ?? "").includes(q),
    );
  }, [commands, query]);

  useEffect(() => setCursor(0), [query]);

  if (!open || !user) return null;

  function runAt(index: number) {
    const command = results[index];
    if (!command) return;
    setOpen(false);
    command.run();
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-slate-900/50 p-4 pt-[12vh] backdrop-blur-sm animate-fade-in"
      onClick={() => setOpen(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Buscador de secciones"
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
          <span className="text-slate-400">⌕</span>
          <input
            ref={inputRef}
            value={query}
            placeholder="Ir a… (matrículas, horarios, alumnos)"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setOpen(false);
              else if (e.key === "ArrowDown") {
                e.preventDefault();
                setCursor((c) => Math.min(c + 1, results.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setCursor((c) => Math.max(c - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                runAt(cursor);
              }
            }}
            className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
          />
          <kbd className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
            esc
          </kbd>
        </div>

        <div className="max-h-80 overflow-y-auto p-2">
          {results.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-slate-400">
              Nada coincide con “{query}”.
            </div>
          ) : (
            results.map((c, i) => (
              <button
                key={c.id}
                onMouseEnter={() => setCursor(i)}
                onClick={() => runAt(i)}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left transition ${
                  i === cursor ? "bg-brand-50 text-brand-900" : "text-slate-700"
                }`}
              >
                <span className="text-sm font-medium">{c.label}</span>
                <span className="text-[11px] text-slate-400">{c.group}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
