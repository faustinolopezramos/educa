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

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  async function onSubmit(values: FormValues) {
    setError(null);
    try {
      await login(values.email, values.password);
      navigate("/");
    } catch {
      setError("Credenciales incorrectas");
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
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Correo
              </label>
              <Input type="email" placeholder="admin@educa.com" {...register("email")} />
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
