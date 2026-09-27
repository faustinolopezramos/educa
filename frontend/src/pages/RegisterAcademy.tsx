import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { z } from "zod";

import { useAuth } from "../auth/AuthContext";
import { Button, Card, Input } from "../components/ui";
import { IconCheck } from "../components/icons";

const schema = z.object({
  academy_name: z
    .string()
    .min(2, "El nombre debe tener al menos 2 caracteres")
    .max(150, "Máximo 150 caracteres"),
  slug: z
    .string()
    .min(2, "El subdominio debe tener al menos 2 caracteres")
    .max(50, "Máximo 50 caracteres")
    .regex(
      /^[a-z0-9-]+$/,
      "Solo letras minúsculas, números y guiones (sin espacios ni acentos)"
    ),
  admin_name: z
    .string()
    .min(2, "Ingresa tu nombre completo")
    .max(255, "Máximo 255 caracteres"),
  admin_email: z.string().email("Ingresa un correo electrónico válido"),
  password: z
    .string()
    .min(8, "La contraseña debe tener al menos 8 caracteres")
    .max(72, "Máximo 72 caracteres"),
  phone: z.string().max(50, "Máximo 50 caracteres").optional(),
});

type FormValues = z.infer<typeof schema>;

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function RegisterAcademy() {
  const { registerAcademy } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  const initialPlan =
    (searchParams.get("plan") as "free" | "starter" | "pro" | "scale") || "free";
  const [selectedPlan, setSelectedPlan] = useState<"free" | "starter" | "pro" | "scale">(
    initialPlan
  );

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      academy_name: "",
      slug: "",
      admin_name: "",
      admin_email: "",
      password: "",
      phone: "",
    },
  });

  const watchAcademyName = watch("academy_name");
  const watchSlug = watch("slug");

  // Auto-generate suggested slug when academy name is typed (if slug wasn't manually touched)
  useEffect(() => {
    if (watchAcademyName && !watchSlug) {
      setValue("slug", slugify(watchAcademyName), { shouldValidate: true });
    }
  }, [watchAcademyName, watchSlug, setValue]);

  async function onSubmit(values: FormValues) {
    setError(null);
    if (!registerAcademy) {
      setError("El servicio de autenticación no está disponible");
      return;
    }
    try {
      await registerAcademy({
        academy_name: values.academy_name,
        slug: values.slug.toLowerCase().trim(),
        admin_name: values.admin_name.trim(),
        admin_email: values.admin_email.toLowerCase().trim(),
        password: values.password,
        phone: values.phone ? values.phone.trim() : undefined,
        plan_tier: selectedPlan,
      });
      // Redirect straight into the dashboard where FirstSteps is active
      navigate("/");
    } catch (err: any) {
      if (err.response?.status === 409) {
        setError(
          err.response.data?.detail ||
            "El subdominio ya está registrado. Por favor elige otro."
        );
      } else {
        setError(
          err.response?.data?.detail ||
            "No se pudo completar el registro. Verifica los datos e intenta nuevamente."
        );
      }
    }
  }

  return (
    <div className="min-h-screen bg-[#FDFBF7] py-10 px-4 sm:px-6 lg:px-8">
      {/* Top Brand Bar */}
      <div className="mx-auto max-w-4xl mb-8 flex items-center justify-between">
        <Link to="/landing" className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 font-serif text-xl font-bold text-white shadow-sm shadow-brand-600/30">
            E
          </div>
          <div className="flex flex-col">
            <span className="font-serif text-xl font-bold tracking-tight text-slate-900">
              Educa
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-widest text-brand-700">
              Nueva Academia
            </span>
          </div>
        </Link>
        <div className="text-xs text-slate-600">
          ¿Ya tienes cuenta?{" "}
          <Link
            to="/login"
            className="font-bold text-brand-600 hover:text-brand-700 underline"
          >
            Iniciar Sesión
          </Link>
        </div>
      </div>

      <div className="mx-auto max-w-4xl grid gap-8 lg:grid-cols-12">
        {/* Left Form Column */}
        <div className="lg:col-span-7">
          <Card>
            <div className="border-b border-stone-100 pb-4 mb-6">
              <h1 className="font-serif text-2xl font-bold text-slate-900">
                Crea tu Academia en 1 Minuto
              </h1>
              <p className="mt-1 text-xs text-slate-500">
                {selectedPlan === "free"
                  ? "Plan gratuito para siempre para hasta 15 alumnos. Sin tarjeta de crédito."
                  : "14 días de prueba gratis con acceso completo. Sin tarjeta de crédito requerida."}
              </p>
            </div>

            {/* Plan Selector */}
            <div className="mb-6">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                Plan Seleccionado
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedPlan("free")}
                  className={`rounded-lg p-2.5 text-center text-xs font-semibold border transition ${
                    selectedPlan === "free"
                      ? "border-emerald-600 bg-emerald-50/80 text-emerald-900 ring-1 ring-emerald-500"
                      : "border-stone-200 bg-white text-slate-600 hover:bg-stone-50"
                  }`}
                >
                  <div className="font-bold text-emerald-800">Gratis</div>
                  <div className="font-extrabold text-slate-900">$0/mes</div>
                  <div className="text-[10px] text-slate-500">Hasta 15 alm.</div>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedPlan("starter")}
                  className={`rounded-lg p-2.5 text-center text-xs font-semibold border transition ${
                    selectedPlan === "starter"
                      ? "border-brand-600 bg-brand-50/80 text-brand-900 ring-1 ring-brand-500"
                      : "border-stone-200 bg-white text-slate-600 hover:bg-stone-50"
                  }`}
                >
                  <div>Starter</div>
                  <div className="font-bold text-slate-900">$49/mes</div>
                  <div className="text-[10px] text-slate-500">Hasta 100 alm.</div>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedPlan("pro")}
                  className={`relative rounded-lg p-2.5 text-center text-xs font-semibold border transition ${
                    selectedPlan === "pro"
                      ? "border-brand-600 bg-brand-50/80 text-brand-900 ring-1 ring-brand-500"
                      : "border-stone-200 bg-white text-slate-600 hover:bg-stone-50"
                  }`}
                >
                  <span className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full bg-brand-600 px-1.5 py-0.2 text-[9px] text-white font-bold">
                    POPULAR
                  </span>
                  <div>Profesional</div>
                  <div className="font-bold text-slate-900">$129/mes</div>
                  <div className="text-[10px] text-slate-500">Hasta 300 alm.</div>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedPlan("scale")}
                  className={`rounded-lg p-2.5 text-center text-xs font-semibold border transition ${
                    selectedPlan === "scale"
                      ? "border-brand-600 bg-brand-50/80 text-brand-900 ring-1 ring-brand-500"
                      : "border-stone-200 bg-white text-slate-600 hover:bg-stone-50"
                  }`}
                >
                  <div>Escala</div>
                  <div className="font-bold text-slate-900">$279/mes</div>
                  <div className="text-[10px] text-slate-500">Hasta 1000 alm.</div>
                </button>
              </div>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
              {/* Academy Name */}
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Nombre de la Institución / Academia *
                </label>
                <Input
                  placeholder="Ej. Instituto Moderno de Idiomas"
                  {...register("academy_name")}
                />
                {errors.academy_name && (
                  <p className="mt-1 text-xs text-red-600">
                    {errors.academy_name.message}
                  </p>
                )}
              </div>

              {/* Subdomain / Slug */}
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Subdominio / Identificador *
                </label>
                <div className="relative">
                  <Input
                    placeholder="instituto-moderno"
                    {...register("slug")}
                  />
                </div>
                <p className="mt-1 text-[11px] text-slate-500">
                  Tu dirección de acceso será:{" "}
                  <span className="font-semibold text-brand-700">
                    {watchSlug || "tuacademia"}.educa.com
                  </span>
                </p>
                {errors.slug && (
                  <p className="mt-1 text-xs text-red-600">{errors.slug.message}</p>
                )}
              </div>

              <div className="border-t border-stone-100 pt-3">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
                  Cuenta del Director / Administrador
                </h2>
              </div>

              {/* Admin Name */}
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Tu Nombre y Apellido *
                </label>
                <Input placeholder="Ej. Lic. Carlos Valdés" {...register("admin_name")} />
                {errors.admin_name && (
                  <p className="mt-1 text-xs text-red-600">
                    {errors.admin_name.message}
                  </p>
                )}
              </div>

              {/* Admin Email */}
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Correo Electrónico de Acceso *
                </label>
                <Input
                  type="email"
                  placeholder="direccion@tuacademia.com"
                  {...register("admin_email")}
                />
                {errors.admin_email && (
                  <p className="mt-1 text-xs text-red-600">
                    {errors.admin_email.message}
                  </p>
                )}
              </div>

              {/* Password */}
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Contraseña de Acceso *
                </label>
                <Input
                  type="password"
                  placeholder="Mínimo 8 caracteres"
                  {...register("password")}
                />
                {errors.password && (
                  <p className="mt-1 text-xs text-red-600">
                    {errors.password.message}
                  </p>
                )}
              </div>

              {/* Phone (Optional) */}
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Teléfono / WhatsApp de Contacto (Opcional)
                </label>
                <Input
                  placeholder="+502 5555-1234"
                  {...register("phone")}
                />
                <p className="mt-0.5 text-[11px] text-slate-400">
                  Para coordinar tu sesión de bienvenida y soporte inicial.
                </p>
              </div>

              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                className="w-full mt-4"
                disabled={isSubmitting}
              >
                {isSubmitting
                  ? "Creando academia y configurando portal…"
                  : selectedPlan === "free"
                    ? "Crear Academia Gratis (Hasta 15 Alumnos) →"
                    : "Comenzar Prueba Gratis (14 Días) →"}
              </Button>

              <div className="text-center text-[11px] text-slate-400">
                Al registrarte aceptas las Condiciones del Servicio y la Política de Privacidad de Educa.
              </div>
            </form>
          </Card>
        </div>

        {/* Right Info Column */}
        <div className="space-y-6 lg:col-span-5">
          <div className="rounded-2xl border border-brand-200 bg-brand-50/50 p-6 text-slate-800">
            <h3 className="font-serif text-lg font-bold text-brand-900">
              {selectedPlan === "free"
                ? "Todo incluido en tu Plan Gratuito (15 alumnos):"
                : "Todo incluido en tus 14 días de prueba:"}
            </h3>
            <ul className="mt-4 space-y-3 text-xs text-brand-950">
              <li className="flex items-start gap-2.5">
                <IconCheck className="h-4 w-4 shrink-0 text-brand-600 mt-0.5" />
                <span>
                  <strong>Importador masivo en 1 clic:</strong> Carga tus alumnos desde una planilla de Excel sin perder horas.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <IconCheck className="h-4 w-4 shrink-0 text-brand-600 mt-0.5" />
                <span>
                  <strong>SpeedGrader para profesores:</strong> Revisa y califica tareas en la mitad del tiempo.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <IconCheck className="h-4 w-4 shrink-0 text-brand-600 mt-0.5" />
                <span>
                  <strong>Pase de lista en vivo:</strong> Control de asistencia en cualquier dispositivo móvil.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <IconCheck className="h-4 w-4 shrink-0 text-brand-600 mt-0.5" />
                <span>
                  <strong>Cero comisiones:</strong> No retenemos porcentaje alguno de las colegiaturas de tus alumnos.
                </span>
              </li>
            </ul>
          </div>

          <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-xs">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 font-bold">
                ✓
              </div>
              <div>
                <div className="text-sm font-bold text-slate-900">
                  Garantía de Cero Fricción
                </div>
                <div className="text-xs text-slate-500">
                  No solicitamos tarjeta de crédito para iniciar.
                </div>
              </div>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-slate-600">
              Al terminar tus 14 días, tú decides si deseas continuar con el servicio activando tu suscripción. Si decides no continuar, tus datos se conservan seguros sin ningún cobro sorpresa.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
