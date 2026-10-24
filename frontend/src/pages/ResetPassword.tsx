import { useState, useMemo } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button, Card, Field, PasswordInput } from "../components/ui";
import { IconAlert, IconCheck } from "../components/icons";
import { submitPasswordReset, apiErrorMessage } from "../lib/api";
import { isSupabaseConfigured, updateSupabasePassword } from "../lib/supabase";
import { LegalLinks } from "../legal/LegalLinks";

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // Obtener token desde query param o fragmento hash de Supabase
  const tokenFromUrl = useMemo(() => {
    const qToken = searchParams.get("token");
    if (qToken) return qToken;

    if (typeof window !== "undefined" && window.location.hash) {
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      return hashParams.get("access_token");
    }
    return null;
  }, [searchParams]);

  const token = tokenFromUrl || "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Validaciones
  const hasMinLength = password.length >= 8;
  const hasNumberOrSymbol = /[\d!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password);
  const passwordsMatch = password.length > 0 && password === confirmPassword;
  const isFormValid = hasMinLength && hasNumberOrSymbol && passwordsMatch;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!token.trim()) {
      setError("No se encontró el token de recuperación. Por favor verifica el enlace.");
      return;
    }

    if (!hasMinLength) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }

    if (!hasNumberOrSymbol) {
      setError("La contraseña debe incluir al menos un número o símbolo.");
      return;
    }

    if (!passwordsMatch) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setLoading(true);
    try {
      // Si venimos con token tradicional de EDUCA
      if (tokenFromUrl && !window.location.hash.includes("access_token")) {
        await submitPasswordReset(token.trim(), password);
      } else if (isSupabaseConfigured && window.location.hash.includes("type=recovery")) {
        await updateSupabasePassword(password);
      } else {
        // Fallback genérico intentando API EDUCA
        await submitPasswordReset(token.trim(), password);
      }
      setSuccess(true);
    } catch (err: unknown) {
      const msg = apiErrorMessage(
        err,
        "El enlace de recuperación es inválido o ha expirado. Por favor solicita uno nuevo.",
      );
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

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
            Restablecer contraseña
          </h1>
          <p className="mt-2 text-xs text-slate-600">
            Define una nueva contraseña segura para tu cuenta en Educa.
          </p>
        </div>

        <Card>
          {success ? (
            <div className="space-y-5 py-2 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 ring-4 ring-emerald-50/50">
                <IconCheck className="h-6 w-6 stroke-2" />
              </div>
              <div className="space-y-1">
                <h2 className="text-base font-semibold text-slate-900">
                  ¡Contraseña actualizada!
                </h2>
                <p className="text-xs leading-relaxed text-slate-600">
                  Tu contraseña ha sido actualizada con éxito. Por seguridad, todas las demás sesiones activas se han cerrado.
                </p>
              </div>
              <Button
                variant="primary"
                className="w-full"
                onClick={() => navigate("/login", { replace: true })}
              >
                Iniciar sesión ahora
              </Button>
            </div>
          ) : !token ? (
            <div className="space-y-4 py-2 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600 ring-4 ring-amber-50/50">
                <IconAlert className="h-6 w-6 stroke-2" />
              </div>
              <div className="space-y-1">
                <h2 className="text-base font-semibold text-slate-900">
                  Enlace incompleto o expirado
                </h2>
                <p className="text-xs leading-relaxed text-slate-600">
                  No se detectó un token de recuperación válido en la dirección web. Asegúrate de hacer clic en el enlace completo que llegó a tu correo.
                </p>
              </div>
              <div className="pt-2">
                <Link
                  to="/login"
                  className="inline-flex items-center justify-center w-full rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white hover:bg-slate-800 transition"
                >
                  Volver al inicio de sesión
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate className="space-y-4">
              <Field label="Nueva contraseña">
                <PasswordInput
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Al menos 8 caracteres"
                  autoComplete="new-password"
                  disabled={loading}
                  required
                />
              </Field>

              <Field label="Confirmar nueva contraseña">
                <PasswordInput
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repite la contraseña"
                  autoComplete="new-password"
                  disabled={loading}
                  ariaLabelShow="Mostrar confirmación"
                  ariaLabelHide="Ocultar confirmación"
                  required
                />
              </Field>

              {/* Indicadores de requisitos de contraseña */}
              <div className="rounded-lg bg-slate-50 p-3 space-y-1.5 border border-slate-100 text-xs">
                <p className="font-medium text-slate-700">Requisitos de seguridad:</p>
                <div className="space-y-1">
                  <div className={`flex items-center gap-1.5 ${hasMinLength ? "text-emerald-700" : "text-slate-500"}`}>
                    <span className="text-xs">{hasMinLength ? "✓" : "○"}</span>
                    <span>Mínimo 8 caracteres</span>
                  </div>
                  <div className={`flex items-center gap-1.5 ${hasNumberOrSymbol ? "text-emerald-700" : "text-slate-500"}`}>
                    <span className="text-xs">{hasNumberOrSymbol ? "✓" : "○"}</span>
                    <span>Al menos un número o símbolo</span>
                  </div>
                  <div className={`flex items-center gap-1.5 ${passwordsMatch ? "text-emerald-700" : "text-slate-500"}`}>
                    <span className="text-xs">{passwordsMatch ? "✓" : "○"}</span>
                    <span>Las contraseñas coinciden</span>
                  </div>
                </div>
              </div>

              {error && (
                <div role="alert" className="flex items-start gap-2 rounded-lg bg-red-50 p-2.5 text-xs text-red-700 border border-red-200">
                  <IconAlert className="h-4 w-4 shrink-0 text-red-500 mt-0.5" />
                  <p className="leading-snug">{error}</p>
                </div>
              )}

              <Button
                type="submit"
                variant="primary"
                className="w-full"
                disabled={loading || !isFormValid}
              >
                {loading ? "Actualizando…" : "Restablecer y entrar"}
              </Button>

              <div className="pt-1 text-center">
                <Link
                  to="/login"
                  className="text-xs font-medium text-slate-500 hover:text-slate-800 underline transition"
                >
                  ← Volver a iniciar sesión
                </Link>
              </div>
            </form>
          )}
        </Card>

        <p className="mt-6 text-center text-xs text-slate-500">
          <Link to="/" className="hover:text-slate-600 underline">
            ← Volver a la portada
          </Link>
        </p>
        <LegalLinks className="mt-3 justify-center text-slate-500" />
      </div>
    </div>
  );
}
