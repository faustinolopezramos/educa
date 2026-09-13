import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { z } from "zod";

import { useAuth } from "../auth/AuthContext";
import { Button, Card, Input } from "../components/ui";

const schema = z.object({
  email: z.string().email("Correo inválido"),
  password: z
    .string()
    .min(1, "Requerido")
    .max(72, "Máximo 72 caracteres"),
});

type FormValues = z.infer<typeof schema>;

interface TenantOption {
  id: number;
  slug: string;
  name: string;
}

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [availableTenants, setAvailableTenants] = useState<TenantOption[] | null>(null);
  const [selectedTenantSlug, setSelectedTenantSlug] = useState<string>("");

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  async function onSubmit(values: FormValues) {
    setError(null);
    try {
      if (selectedTenantSlug) {
        await login(values.email, values.password, selectedTenantSlug);
      } else {
        await login(values.email, values.password);
      }
      navigate("/");
    } catch (err: any) {
      if (err.response?.status === 409 && err.response?.data?.detail?.code === "tenant_required") {
        const tenants: TenantOption[] = err.response.data.detail.tenants || [];
        setAvailableTenants(tenants);
        if (tenants.length > 0) {
          setSelectedTenantSlug(tenants[0].slug);
        }
        setError("Este correo está registrado en varias academias. Por favor selecciona a cuál deseas ingresar.");
      } else {
        setError(
          typeof err.response?.data?.detail === "string"
            ? err.response.data.detail
            : "Credenciales incorrectas"
        );
      }
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 font-serif text-2xl font-medium text-white">
            E
          </div>
          <div className="font-serif text-3xl font-medium tracking-tight text-slate-900">
            Educa
          </div>
          <div className="mt-1 text-sm text-slate-500">
            Control Académico y Aula Virtual
          </div>
        </div>
        <Card>
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Correo
              </label>
              <Input
                type="email"
                placeholder="admin@educa.com"
                {...register("email")}
                onChange={() => {
                  if (availableTenants) setAvailableTenants(null);
                }}
              />
              {errors.email && (
                <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Contraseña
              </label>
              <Input type="password" placeholder="••••••••" {...register("password")} />
              {errors.password && (
                <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>
              )}
            </div>

            {availableTenants && availableTenants.length > 0 && (
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Institución / Academia
                </label>
                <select
                  value={selectedTenantSlug}
                  onChange={(e) => setSelectedTenantSlug(e.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  {availableTenants.map((t) => (
                    <option key={t.slug} value={t.slug}>
                      {t.name} ({t.slug})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Entrando…" : "Entrar"}
            </Button>
          </form>
        </Card>
        <p className="mt-4 text-center text-xs text-slate-400">
          Demo: admin@educa.com / admin123
        </p>
      </div>
    </div>
  );
}
