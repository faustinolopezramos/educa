import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";
import { authErrorMessage, tenantChoices, type TenantOption } from "../auth/authErrors";
import { Button, Card, Field, Select } from "../components/ui";
import { clearProviderSession, finishProviderLogin } from "../lib/supabase";

type Stage =
  | { kind: "working" }
  | { kind: "choose"; tenants: TenantOption[] }
  | { kind: "failed"; message: string };

/**
 * Adonde vuelve la persona después de entrar en Google, Microsoft o Apple.
 *
 * Canjea el código del proveedor por el token de Supabase, y ése por una sesión
 * de EDUCA. Si el correo está en varias academias, pregunta en cuál entrar; si
 * no tiene cuenta, lo dice con todas las letras.
 */
export default function AuthCallback() {
  const { loginWithProviderToken } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [stage, setStage] = useState<Stage>({ kind: "working" });
  const [chosen, setChosen] = useState("");
  // El token de Supabase sigue valiendo un rato: con él se repite el canje
  // tras elegir academia, sin volver a pasar por el proveedor.
  const pending = useRef<{ token: string; returnTo: string } | null>(null);
  // En desarrollo React monta dos veces; el código del proveedor sólo vale una.
  const started = useRef(false);

  async function exchange(token: string, returnTo: string, tenantSlug?: string) {
    if (!loginWithProviderToken) {
      setStage({ kind: "failed", message: "El servicio de autenticación no está disponible." });
      return;
    }
    try {
      const result = await loginWithProviderToken(token, tenantSlug);
      // Si el login devuelve un desafío MFA, redirigir a la página de verificación
      if ("mfa_required" in result && result.mfa_required) {
        await clearProviderSession();
        navigate("/mfa-verify", { state: { tempToken: result.temp_token, from: returnTo }, replace: true });
        return;
      }
      await clearProviderSession();
      navigate(returnTo, { replace: true });
    } catch (err) {
      const tenants = tenantChoices(err);
      if (tenants && tenants.length > 0) {
        pending.current = { token, returnTo };
        setChosen(tenants[0].slug);
        setStage({ kind: "choose", tenants });
        return;
      }
      await clearProviderSession();
      setStage({ kind: "failed", message: authErrorMessage(err) });
    }
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const providerError = params.get("error_description") ?? params.get("error");
    const code = params.get("code");

    // Revisar también si Supabase o Magic Link retornó mediante fragmento hash (#access_token=... o #error=...)
    let hashError: string | null = null;
    let hashAccessToken: string | null = null;
    if (typeof window !== "undefined" && window.location.hash) {
      const rawHash = window.location.hash.startsWith("#")
        ? window.location.hash.substring(1)
        : window.location.hash;
      const hashParams = new URLSearchParams(rawHash);
      hashError = hashParams.get("error_description") ?? hashParams.get("error");
      hashAccessToken = hashParams.get("access_token");
    }

    const effectiveError = providerError || hashError;
    if (effectiveError || (!code && !hashAccessToken)) {
      setStage({
        kind: "failed",
        message: effectiveError
          ? "El proveedor no completó el inicio de sesión. Inténtalo de nuevo."
          : "Falta la respuesta del proveedor. Vuelve a iniciar sesión.",
      });
      return;
    }

    void (async () => {
      try {
        const { supabaseToken, tenantSlug, returnTo } = hashAccessToken
          ? await finishProviderLogin(undefined, { accessToken: hashAccessToken })
          : await finishProviderLogin(code!);
        await exchange(supabaseToken, returnTo ?? "/", tenantSlug);
      } catch (err: unknown) {
        console.error("Error al procesar callback del proveedor:", err);
        await clearProviderSession();
        const detail = err instanceof Error ? err.message : "";
        setStage({
          kind: "failed",
          message: detail
            ? `No se pudo completar el inicio de sesión (${detail}). Vuelve a intentarlo.`
            : "No se pudo completar el inicio de sesión. Si el enlace es antiguo, vuelve a intentarlo.",
        });
      }
    })();
    // Se ejecuta una sola vez, al llegar del proveedor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex min-h-full items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <Card>
          {stage.kind === "working" && (
            <p role="status" className="py-6 text-center text-sm text-slate-600">
              Iniciando sesión…
            </p>
          )}

          {stage.kind === "choose" && (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                const p = pending.current;
                if (!p || !chosen) return;
                setStage({ kind: "working" });
                void exchange(p.token, p.returnTo, chosen);
              }}
            >
              <p className="text-sm text-slate-700">
                Tu correo está registrado en varias academias. ¿A cuál quieres entrar?
              </p>
              <Field label="Institución / Academia">
                <Select value={chosen} onChange={(e) => setChosen(e.target.value)}>
                  {stage.tenants.map((t) => (
                    <option key={t.slug} value={t.slug}>
                      {t.name} ({t.slug})
                    </option>
                  ))}
                </Select>
              </Field>
              <Button type="submit" className="w-full">
                Entrar
              </Button>
            </form>
          )}

          {stage.kind === "failed" && (
            <div className="space-y-4">
              <p role="alert" className="text-sm text-red-700">
                {stage.message}
              </p>
              {stage.message.toLowerCase().includes("no tiene cuenta") && (
                <div>
                  <Link
                    to={(() => {
                      const emailMatch = stage.message.match(
                        /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/,
                      );
                      return emailMatch
                        ? `/crear-academia?email=${encodeURIComponent(emailMatch[1])}`
                        : "/crear-academia";
                    })()}
                    className="inline-flex w-full items-center justify-center rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 transition"
                  >
                    Crear mi academia en EDUCA →
                  </Link>
                </div>
              )}
              <div>
                <Link
                  to="/login"
                  className="inline-block text-sm font-semibold text-brand-700 hover:text-brand-800"
                >
                  ← Volver a iniciar sesión
                </Link>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
