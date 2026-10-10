import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { useAuth } from "../auth/AuthContext";
import { authErrorMessage } from "../auth/authErrors";
import { Button, Card, Field, Input } from "../components/ui";

const schema = z.object({
  token: z.string().min(6, "El código debe tener 6 dígitos").max(8, "Código demasiado largo"),
});

type FormValues = z.infer<typeof schema>;

/**
 * Pantalla de verificación MFA (segundo factor).
 *
 * Se muestra tras un login exitoso si el usuario tiene MFA activado.
 * El usuario debe introducir el código de 6 dígitos de su app autenticadora
 * o un código de respaldo.
 */
export default function MFAVerifyPage() {
  const { verifyMFA } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as { tempToken?: string; from?: { pathname?: string } } | null;
  const rawTempToken = state?.tempToken;
  const goTo = state?.from?.pathname || "/";
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!rawTempToken) {
    return (
      <div className="flex min-h-full items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm text-center">
          <p className="text-red-600">Token temporal MFA no encontrado. Vuelve a iniciar sesión.</p>
          <button
            type="button"
            onClick={() => navigate("/login", { replace: true })}
            className="mt-4 text-brand-700 hover:text-brand-800 underline"
          >
            ← Volver al inicio de sesión
          </button>
        </div>
      </div>
    );
  }

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { token: "" },
  });

  async function onSubmit(values: FormValues) {
    setError(null);
    setLoading(true);
    try {
      if (!verifyMFA) {
        throw new Error("Servicio de autenticación no disponible");
      }
      // rawTempToken is guaranteed to exist here due to early return above
      await verifyMFA(values.token, rawTempToken!);
      navigate(goTo, { replace: true });
    } catch (err: unknown) {
      setError(authErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 font-serif text-2xl font-medium text-white">
            E
          </div>
          <h1 className="font-serif text-2xl font-medium tracking-tight text-slate-900">
            Autenticación de dos factores
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Introduce el código de 6 dígitos de tu app autenticadora
          </p>
        </div>

        <Card>
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
            <Field label="Código de verificación" error={errors.token?.message}>
              <Input
                type="text"
                autoComplete="one-time-code"
                inputMode="numeric"
                placeholder="000000"
                maxLength={8}
                {...register("token")}
                className="text-center text-2xl tracking-widest"
              />
            </Field>

            <p className="text-xs text-slate-500 text-center">
              ¿No tienes acceso a tu app? Usa un{" "}
              <button
                type="button"
                className="font-medium text-brand-700 hover:text-brand-800 underline"
                onClick={() => setError("Función de códigos de respaldo pendiente")}
              >
                código de respaldo
              </button>
            </p>

            {error && (
              <p role="alert" className="text-sm text-red-600 text-center">
                {error}
              </p>
            )}

            <Button type="submit" className="w-full" disabled={isSubmitting || loading}>
              {isSubmitting || loading ? "Verificando…" : "Verificar y entrar"}
            </Button>
          </form>
        </Card>

        <p className="mt-6 text-center text-xs text-slate-400">
          <button
            type="button"
            onClick={() => navigate("/login", { replace: true })}
            className="hover:text-slate-600 underline"
          >
            ← Volver al inicio de sesión
          </button>
        </p>
      </div>
    </div>
  );
}