import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { z } from "zod";

import { useAuth } from "../auth/AuthContext";
import { authErrorMessage, tenantChoices, type TenantOption } from "../auth/authErrors";
import { ProviderButtons } from "../auth/ProviderButtons";
import { LegalLinks } from "../legal/LegalLinks";
import { Button, Card, Field, Input, PasswordInput, Select } from "../components/ui";
import {
  IconCheck,
  IconLock,
  IconSpinner,
} from "../components/icons";
import {
  isSupabaseConfigured,
  OAUTH_PROVIDERS,
  detectEmailProvider,
  sendMagicLink,
  sendPasswordResetEmail,
  startProviderLogin,
  type OAuthProvider,
} from "../lib/supabase";
import { requestPasswordReset } from "../lib/api";

const schema = z.object({
  email: z.string().email("Correo inválido"),
  password: z
    .string()
    .min(1, "Requerido")
    .max(72, "Máximo 72 caracteres"),
});

type FormValues = z.infer<typeof schema>;

const SAVED_EMAIL_KEY = "educa_saved_email";
const LAST_TENANT_KEY = "educa_last_tenant";

function GoogleSmallIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-4 w-4 shrink-0" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

function MicrosoftSmallIcon() {
  return (
    <svg viewBox="0 0 21 21" className="h-4 w-4 shrink-0" aria-hidden="true">
      <rect x="1" y="1" width="9" height="9" fill="#F25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
      <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
      <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
    </svg>
  );
}

/** Adónde volver tras entrar: la página que pidió el login, o el panel. */
export function returnPath(state: unknown): string {
  const from = (state as { from?: { pathname?: string; search?: string } } | null)?.from;
  if (!from?.pathname || from.pathname === "/login") return "/";
  return `${from.pathname}${from.search ?? ""}`;
}

/**
 * Iniciar sesión en EDUCA.
 *
 * Ofrece acceso rápido con Google/Microsoft/Apple, inicio mediante contraseña
 * con visibilidad alternable, enlace mágico sin contraseña y recuperación
 * autoservicio segura contra ataques de enumeración y fuerza bruta.
 */
export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const goTo = returnPath(location.state);

  const [mode, setMode] = useState<"login" | "forgot">("login");
  const [error, setError] = useState<string | null>(null);
  const [availableTenants, setAvailableTenants] = useState<TenantOption[] | null>(null);
  const [selectedTenantSlug, setSelectedTenantSlug] = useState<string>("");

  const savedEmail =
    typeof window !== "undefined" ? localStorage.getItem(SAVED_EMAIL_KEY) ?? "" : "";
  const [rememberEmail, setRememberEmail] = useState<boolean>(Boolean(savedEmail));
  const [magicLinkSent, setMagicLinkSent] = useState<boolean>(false);
  const [magicLinkLoading, setMagicLinkLoading] = useState<boolean>(false);
  const [fastOAuthLoading, setFastOAuthLoading] = useState<string | null>(null);

  // Estado para recuperación de contraseña
  const [forgotEmail, setForgotEmail] = useState<string>("");
  const [forgotLoading, setForgotLoading] = useState<boolean>(false);
  const [forgotSuccess, setForgotSuccess] = useState<boolean>(false);

  // Cargar último tenant seleccionado
  const lastTenantSlug =
    typeof window !== "undefined" ? localStorage.getItem(LAST_TENANT_KEY) ?? "" : "";
  const [rememberTenant, setRememberTenant] = useState<boolean>(Boolean(lastTenantSlug));

  // Auto-seleccionar último tenant si está guardado y no hay tenants disponibles aún
  useEffect(() => {
    if (lastTenantSlug && !selectedTenantSlug && !availableTenants) {
      setSelectedTenantSlug(lastTenantSlug);
    }
  }, [lastTenantSlug, selectedTenantSlug, availableTenants]);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      email: savedEmail,
      password: "",
    },
  });

  const currentEmail = watch("email") || "";
  const detectedProvider = detectEmailProvider(currentEmail);
  const isDetectedProviderActive =
    Boolean(detectedProvider && OAUTH_PROVIDERS.includes(detectedProvider));

  // Detectar bloqueo por demasiados intentos (HTTP 429)
  const isRateLimited = Boolean(
    error &&
      (error.toLowerCase().includes("demasiados intentos") ||
        error.toLowerCase().includes("espera un minuto") ||
        error.toLowerCase().includes("rate limit")),
  );

  // Quien ya tiene sesión no tiene nada que hacer aquí.
  if (user) return <Navigate to={goTo} replace />;

  async function onSubmit(values: FormValues) {
    setError(null);
    try {
      if (rememberEmail) {
        localStorage.setItem(SAVED_EMAIL_KEY, values.email.trim());
      } else {
        localStorage.removeItem(SAVED_EMAIL_KEY);
      }
      // Guardar tenant seleccionado si el usuario quiere recordarlo
      if (rememberTenant && selectedTenantSlug) {
        localStorage.setItem(LAST_TENANT_KEY, selectedTenantSlug);
      } else if (!rememberTenant) {
        localStorage.removeItem(LAST_TENANT_KEY);
      }
      const result = await login(values.email, values.password, selectedTenantSlug || undefined);
      // Si el login devuelve un desafío MFA, redirigir a la página de verificación
      if ("mfa_required" in result && result.mfa_required) {
        navigate("/mfa-verify", { state: { tempToken: result.temp_token, from: goTo }, replace: true });
        return;
      }
      navigate(goTo, { replace: true });
    } catch (err: unknown) {
      const tenants = tenantChoices(err);
      if (tenants) {
        setAvailableTenants(tenants);
        if (tenants.length > 0) setSelectedTenantSlug(tenants[0].slug);
        setError(
          "Este correo está registrado en varias academias. Selecciona a cuál deseas ingresar.",
        );
      } else {
        setError(authErrorMessage(err));
      }
    }
  }

  async function handleFastOAuth(provider: OAuthProvider) {
    setError(null);
    setFastOAuthLoading(provider);
    try {
      if (rememberEmail && currentEmail) {
        localStorage.setItem(SAVED_EMAIL_KEY, currentEmail.trim());
      }
      await startProviderLogin(provider, {
        tenantSlug: selectedTenantSlug || undefined,
        returnTo: goTo,
        loginHint: currentEmail.trim() || undefined,
      });
    } catch (err: unknown) {
      console.error("Error al iniciar OAuth con proveedor:", err);
      setFastOAuthLoading(null);
      const detail = err instanceof Error ? err.message : "";
      setError(
        detail
          ? `No se pudo abrir el inicio de sesión (${detail}). Revisa la conexión con el proveedor.`
          : "No se pudo abrir el inicio de sesión del proveedor. Inténtalo de nuevo.",
      );
    }
  }

  async function handleSendMagicLink() {
    setError(null);
    const emailVal = currentEmail.trim();
    if (!emailVal || !emailVal.includes("@")) {
      setError("Por favor escribe tu correo electrónico completo para enviarte el enlace de acceso.");
      return;
    }
    setMagicLinkLoading(true);
    try {
      if (rememberEmail) {
        localStorage.setItem(SAVED_EMAIL_KEY, emailVal);
      }
      await sendMagicLink(emailVal, {
        tenantSlug: selectedTenantSlug || undefined,
        returnTo: goTo,
      });
      setMagicLinkSent(true);
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo enviar el enlace al correo. Inténtalo de nuevo o ingresa tu contraseña.",
      );
    } finally {
      setMagicLinkLoading(false);
    }
  }

  async function handleForgotPasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const emailVal = forgotEmail.trim();
    if (!emailVal || !emailVal.includes("@")) {
      setError("Por favor escribe un correo electrónico válido.");
      return;
    }
    setForgotLoading(true);
    try {
      if (isSupabaseConfigured) {
        try {
          await sendPasswordResetEmail(emailVal);
        } catch {
          await requestPasswordReset(emailVal, selectedTenantSlug || undefined);
        }
      } else {
        await requestPasswordReset(emailVal, selectedTenantSlug || undefined);
      }
      setForgotSuccess(true);
    } catch {
      // Política de seguridad anti-enumeración: respuesta uniforme de éxito
      setForgotSuccess(true);
    } finally {
      setForgotLoading(false);
    }
  }

  const emailField = register("email");

  return (
    <div className="flex min-h-full items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Link to="/" aria-label="Ir a la portada de EDUCA" className="inline-block">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 font-serif text-2xl font-medium text-white shadow-sm hover:bg-brand-700 transition">
              E
            </div>
          </Link>
          <h1 className="font-serif text-2xl font-medium tracking-tight text-slate-900">
            {mode === "forgot" ? "Recuperar contraseña" : "Inicia sesión en Educa"}
          </h1>
          <p className="mt-2 text-xs text-slate-600">
            {mode === "forgot"
              ? "Ingresa tu correo y te enviaremos un enlace seguro para restablecerla."
              : "Bienvenido de nuevo a tu aula virtual"}
          </p>
        </div>

        <Card>
          {mode === "forgot" ? (
            forgotSuccess ? (
              <div className="space-y-4 py-2 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 ring-4 ring-emerald-50/50">
                  <IconCheck className="h-6 w-6 stroke-2" />
                </div>
                <div className="space-y-1">
                  <h2 className="text-sm font-semibold text-slate-900">
                    ¡Solicitud recibida!
                  </h2>
                  <p className="text-xs leading-relaxed text-slate-600">
                    Si existe una cuenta asociada a <strong className="font-semibold text-slate-800">{forgotEmail}</strong>, hemos enviado un enlace de recuperación. Revisa tu bandeja de entrada y spam.
                  </p>
                </div>
                <div className="pt-2 space-y-2">
                  <Button
                    type="button"
                    variant="primary"
                    className="w-full"
                    onClick={() => {
                      setMode("login");
                      setForgotSuccess(false);
                      setError(null);
                    }}
                  >
                    Volver a iniciar sesión
                  </Button>
                  <button
                    type="button"
                    onClick={() => setForgotSuccess(false)}
                    className="text-xs text-slate-500 hover:text-slate-700 underline transition"
                  >
                    ¿No te llegó el correo? Reintentar
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleForgotPasswordSubmit} noValidate className="space-y-4">
                <Field label="Correo electrónico" error={error && !error.includes("varias") ? error : undefined}>
                  <Input
                    type="email"
                    autoComplete="email"
                    placeholder="tu@correo.com"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    disabled={forgotLoading}
                    required
                  />
                </Field>

                {availableTenants && availableTenants.length > 0 && (
                  <Field label="Institución / Academia">
                    <Select
                      value={selectedTenantSlug}
                      onChange={(e) => setSelectedTenantSlug(e.target.value)}
                      disabled={forgotLoading}
                    >
                      {availableTenants.map((t) => (
                        <option key={t.slug} value={t.slug}>
                          {t.name} ({t.slug})
                        </option>
                      ))}
                    </Select>
                  </Field>
                )}

                <Button
                  type="submit"
                  variant="primary"
                  className="w-full"
                  disabled={forgotLoading || !forgotEmail.trim()}
                >
                  {forgotLoading ? "Enviando instrucciones…" : "Enviar enlace de recuperación"}
                </Button>

                <div className="pt-1 text-center">
                  <button
                    type="button"
                    onClick={() => {
                      setMode("login");
                      setError(null);
                    }}
                    className="text-xs font-medium text-slate-500 hover:text-slate-800 underline transition"
                  >
                    ← Volver a iniciar sesión
                  </button>
                </div>
              </form>
            )
          ) : (
            <>
              {OAUTH_PROVIDERS.length > 0 && (
                <>
                  <ProviderButtons
                    tenantSlug={selectedTenantSlug || undefined}
                    returnTo={goTo}
                    loginHint={currentEmail.trim() || undefined}
                    onError={setError}
                  />
                  <div className="my-5 flex items-center gap-3 text-xs text-slate-500">
                    <span className="h-px flex-1 bg-slate-200" />o con tu correo
                    <span className="h-px flex-1 bg-slate-200" />
                  </div>
                </>
              )}

              {magicLinkSent ? (
                <div className="space-y-4 py-1 text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600 ring-4 ring-brand-50/50">
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">
                      ¡Enlace de acceso enviado!
                    </h2>
                    <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                      Revisa tu bandeja de entrada en <strong className="font-semibold text-slate-800">{currentEmail}</strong> y haz clic en el enlace para entrar de inmediato.
                    </p>
                  </div>
                  <div className="space-y-2 pt-2 text-xs">
                    <button
                      type="button"
                      onClick={handleSendMagicLink}
                      disabled={magicLinkLoading}
                      className="font-medium text-brand-700 hover:text-brand-800 underline transition disabled:opacity-50"
                    >
                      {magicLinkLoading ? "Reenviando…" : "Reenviar enlace de acceso"}
                    </button>
                    <div>
                      <button
                        type="button"
                        onClick={() => setMagicLinkSent(false)}
                        className="text-slate-500 hover:text-slate-700 underline transition"
                      >
                        Volver a iniciar sesión con contraseña
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
                  <Field label="Correo" error={errors.email?.message}>
                    <Input
                      type="email"
                      autoComplete="email"
                      placeholder="tu@correo.com"
                      {...emailField}
                      onChange={(e) => {
                        void emailField.onChange(e);
                        // Otro correo puede ser de otra academia: se vuelve a preguntar.
                        if (availableTenants) {
                          setAvailableTenants(null);
                          setSelectedTenantSlug("");
                        }
                      }}
                    />
                  </Field>

                  {/* Sugerencia rápida cuando se detecta dominio de Google o Microsoft */}
                  {isDetectedProviderActive && (
                    <div className="animate-fade-in rounded-lg border border-brand-200 bg-brand-50/70 p-2.5 text-xs text-brand-900">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          {detectedProvider === "google" ? <GoogleSmallIcon /> : <MicrosoftSmallIcon />}
                          <span className="font-medium text-slate-800">
                            {detectedProvider === "google"
                              ? "Cuenta de Google detectada"
                              : "Cuenta de Microsoft detectada"}
                          </span>
                        </div>
                        <button
                          type="button"
                          disabled={fastOAuthLoading !== null}
                          onClick={() => handleFastOAuth(detectedProvider!)}
                          className="shrink-0 rounded-md bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white shadow-sm hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 transition disabled:opacity-50"
                        >
                          {fastOAuthLoading === detectedProvider
                            ? "Abriendo…"
                            : detectedProvider === "google"
                              ? "Entrar con Google"
                              : "Entrar con Microsoft"}
                        </button>
                      </div>
                    </div>
                  )}

                  <Field label="Contraseña" error={errors.password?.message}>
                    <PasswordInput
                      autoComplete="current-password"
                      placeholder="••••••••"
                      {...register("password")}
                    />
                  </Field>

                  <div className="flex items-center justify-between text-xs text-slate-600">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={rememberEmail}
                        onChange={(e) => {
                          setRememberEmail(e.target.checked);
                          if (!e.target.checked) {
                            localStorage.removeItem(SAVED_EMAIL_KEY);
                          }
                        }}
                        className="rounded border-slate-300 text-brand-600 focus:ring-brand-500/30"
                      />
                      <span>Recordar mi correo</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setError(null);
                        setForgotEmail(currentEmail || savedEmail);
                        setForgotSuccess(false);
                        setMode("forgot");
                      }}
                      className="font-medium text-brand-700 hover:text-brand-800 underline transition text-xs"
                    >
                      ¿Olvidaste tu contraseña?
                    </button>
                  </div>

                  {availableTenants && availableTenants.length > 0 && (
                    <div className="space-y-2.5 rounded-lg border border-brand-200 bg-brand-50/50 p-3">
                      <Field label="Institución / Academia">
                        <Select
                          value={selectedTenantSlug}
                          onChange={(e) => setSelectedTenantSlug(e.target.value)}
                        >
                          {availableTenants.map((t) => (
                            <option key={t.slug} value={t.slug}>
                              {t.name} ({t.slug})
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-slate-600">
                        <input
                          type="checkbox"
                          checked={rememberTenant}
                          onChange={(e) => {
                            setRememberTenant(e.target.checked);
                            if (!e.target.checked) {
                              localStorage.removeItem(LAST_TENANT_KEY);
                            }
                          }}
                          className="rounded border-slate-300 text-brand-600 focus:ring-brand-500/30"
                        />
                        <span>Recordar academia</span>
                      </label>
                    </div>
                  )}

                  {/* Alerta destacada para bloqueo / límite de tasa (429) */}
                  {isRateLimited ? (
                    <div role="alert" className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                      <IconLock className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                      <div className="space-y-1 flex-1">
                        <p className="font-semibold text-amber-900">Acceso protegido temporalmente</p>
                        <p className="leading-relaxed text-amber-800">{error}</p>
                        <button
                          type="button"
                          onClick={() => {
                            setError(null);
                            setForgotEmail(currentEmail || savedEmail);
                            setForgotSuccess(false);
                            setMode("forgot");
                          }}
                          className="font-medium text-amber-950 underline hover:text-black transition inline-block pt-0.5"
                        >
                          ¿Olvidaste tu contraseña? Restablécela aquí →
                        </button>
                      </div>
                    </div>
                  ) : (
                    error && (
                      <div className="space-y-1">
                        <p role="alert" className="text-sm text-red-600">
                          {error}
                        </p>
                        {error.toLowerCase().includes("no tiene cuenta") && (
                          <p className="text-xs text-slate-600">
                            ¿Deseas dar de alta tu academia?{" "}
                            <Link
                              to={`/crear-academia?email=${encodeURIComponent(currentEmail.trim())}`}
                              className="font-semibold text-brand-700 hover:text-brand-800 underline"
                            >
                              Crear academia aquí →
                            </Link>
                          </p>
                        )}
                      </div>
                    )
                  )}

                  <Button type="submit" className="w-full flex items-center justify-center gap-2" disabled={isSubmitting}>
                    {isSubmitting ? (
                      <>
                        <IconSpinner className="h-4 w-4" />
                        <span>Entrando…</span>
                      </>
                    ) : (
                      "Entrar"
                    )}
                  </Button>

                  {isSupabaseConfigured && (
                    <div className="pt-1 text-center">
                      <button
                        type="button"
                        onClick={handleSendMagicLink}
                        disabled={magicLinkLoading}
                        className="text-xs font-medium text-brand-700 hover:text-brand-800 underline transition disabled:opacity-50"
                      >
                        {magicLinkLoading
                          ? "Enviando enlace…"
                          : "¿Prefieres entrar sin contraseña? Enviar enlace al correo"}
                      </button>
                    </div>
                  )}
                </form>
              )}
            </>
          )}
        </Card>

        <p className="mt-6 text-center text-xs text-slate-500">
          <Link to="/" className="hover:text-slate-700 underline">
            ← Volver a la portada
          </Link>
        </p>
        <LegalLinks className="mt-3 justify-center text-slate-500" />
      </div>
    </div>
  );
}
