import { useState } from "react";

import { OAUTH_PROVIDERS, startProviderLogin, type OAuthProvider } from "../lib/supabase";

const LABELS: Record<OAuthProvider, string> = {
  google: "Continuar con Google",
  azure: "Continuar con Microsoft",
  apple: "Continuar con Apple",
  github: "Continuar con GitHub",
  gitlab: "Continuar con GitLab",
  slack: "Continuar con Slack",
  bitbucket: "Continuar con Bitbucket",
  discord: "Continuar con Discord",
  facebook: "Continuar con Facebook",
  twitter: "Continuar con Twitter",
};

/** Los logotipos oficiales, tal como piden las guías de cada proveedor. */
function ProviderLogo({ provider }: { provider: OAuthProvider }) {
  if (provider === "google") {
    return (
      <svg viewBox="0 0 48 48" className="h-4 w-4" aria-hidden="true">
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
      </svg>
    );
  }
  if (provider === "azure") {
    return (
      <svg viewBox="0 0 21 21" className="h-4 w-4" aria-hidden="true">
        <rect x="1" y="1" width="9" height="9" fill="#F25022" />
        <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
        <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
        <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true" fill="currentColor">
      <path d="M16.37 12.62c-.02-2.33 1.9-3.45 1.99-3.5-1.08-1.59-2.77-1.8-3.37-1.83-1.43-.15-2.8.84-3.53.84-.73 0-1.85-.82-3.04-.8-1.56.02-3.01.91-3.81 2.31-1.63 2.82-.42 6.98 1.17 9.27.78 1.12 1.7 2.37 2.9 2.33 1.17-.05 1.61-.75 3.02-.75 1.41 0 1.81.75 3.04.73 1.26-.02 2.05-1.13 2.82-2.26.89-1.3 1.25-2.56 1.27-2.62-.03-.01-2.44-.94-2.46-3.72zM14.07 5.78c.64-.78 1.08-1.86.96-2.94-.93.04-2.05.62-2.71 1.39-.6.69-1.12 1.79-.98 2.85 1.03.08 2.09-.53 2.73-1.3z" />
    </svg>
  );
}

/**
 * Entrar con la cuenta de Google, Microsoft o Apple que la persona ya usa.
 *
 * Sólo sirve a quien su academia ya dio de alta con ese mismo correo: no crea
 * cuentas. No pinta nada si no hay proveedores activos (`VITE_AUTH_PROVIDERS`).
 */
export function ProviderButtons({
  tenantSlug,
  returnTo,
  loginHint,
  onError,
}: {
  tenantSlug?: string;
  returnTo?: string;
  loginHint?: string;
  onError: (message: string) => void;
}) {
  const [pending, setPending] = useState<OAuthProvider | null>(null);

  if (OAUTH_PROVIDERS.length === 0) return null;

  async function go(provider: OAuthProvider) {
    setPending(provider);
    try {
      // La página se va al proveedor; si vuelve aquí es que algo falló antes.
      await startProviderLogin(provider, {
        tenantSlug,
        returnTo,
        ...(loginHint ? { loginHint } : {}),
      });
    } catch (err: unknown) {
      console.error("Error al iniciar OAuth con proveedor:", err);
      setPending(null);
      const detail = err instanceof Error ? err.message : "";
      onError(
        detail
          ? `No se pudo abrir el inicio de sesión (${detail}). Revisa la conexión con el proveedor.`
          : "No se pudo abrir el inicio de sesión del proveedor. Inténtalo de nuevo.",
      );
    }
  }

  return (
    <div className="space-y-2">
      {OAUTH_PROVIDERS.map((provider) => (
        <button
          key={provider}
          type="button"
          disabled={pending !== null}
          onClick={() => go(provider)}
          className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 disabled:opacity-60"
        >
          <ProviderLogo provider={provider} />
          {pending === provider ? "Abriendo…" : LABELS[provider]}
        </button>
      ))}
      <p className="text-center text-[11px] text-slate-500">
        Acceso rápido con tu cuenta de correo de Google o Microsoft (Outlook)
      </p>
    </div>
  );
}
