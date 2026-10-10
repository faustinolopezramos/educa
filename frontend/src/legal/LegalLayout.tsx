import type { ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";

import { LEGAL, hasPlaceholders } from "./legalInfo";

const DOCS = [
  { to: "/terminos", label: "Términos y Condiciones" },
  { to: "/privacidad", label: "Política de Privacidad" },
  { to: "/cookies", label: "Política de Cookies" },
];

/** Un apartado numerado de un documento legal. */
export function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6">
      <h2 className="mt-10 text-lg font-semibold text-slate-900">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-slate-700">{children}</div>
    </section>
  );
}

/** Lista con viñetas para el cuerpo de un apartado. */
export function Bullets({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-1.5 pl-5">{children}</ul>;
}

/**
 * El armazón común de los tres documentos: título, fecha de vigencia, índice
 * entre documentos y un camino de vuelta. Público: no pide sesión.
 */
export function LegalLayout({
  title,
  summary,
  children,
}: {
  title: string;
  /** Un párrafo en lenguaje llano antes del texto completo. */
  summary: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#FDFBF7]">
      <header className="border-b border-stone-200 bg-white/80">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-600 text-white">
              E
            </span>
            Educa
          </Link>
          <Link to="/login" className="text-sm font-medium text-brand-700 hover:text-brand-800">
            Iniciar sesión
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10">
        <nav aria-label="Documentos legales" className="mb-8 flex flex-wrap gap-2">
          {DOCS.map((d) => (
            <NavLink
              key={d.to}
              to={d.to}
              className={({ isActive }) =>
                `rounded-full border px-3 py-1 text-xs font-semibold transition ${
                  isActive
                    ? "border-brand-600 bg-brand-50 text-brand-800"
                    : "border-stone-200 bg-white text-slate-600 hover:bg-stone-50"
                }`
              }
            >
              {d.label}
            </NavLink>
          ))}
        </nav>

        {hasPlaceholders() && import.meta.env.DEV && (
          <p
            role="note"
            className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900"
          >
            Faltan datos del responsable en <code>src/legal/legalInfo.ts</code> (los valores
            entre corchetes). Este aviso sólo se ve en desarrollo.
          </p>
        )}

        <h1 className="font-serif text-3xl font-semibold tracking-tight text-slate-900">{title}</h1>
        <p className="mt-2 text-xs text-slate-500">
          Vigente desde el {LEGAL.effectiveDate} · versión {LEGAL.version}
        </p>
        <div className="mt-6 rounded-xl border border-brand-100 bg-brand-50/60 p-4 text-sm leading-relaxed text-brand-950">
          {summary}
        </div>

        <article>{children}</article>
      </main>

      <footer className="border-t border-stone-200 py-6 text-center text-xs text-slate-500">
        {LEGAL.product} · {LEGAL.owner} · {LEGAL.country}
      </footer>
    </div>
  );
}
