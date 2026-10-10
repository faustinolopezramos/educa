import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { z } from "zod";

import { useAuth } from "../auth/AuthContext";
import { Button, Card, Field, Input, Select } from "../components/ui";
import { IconCheck } from "../components/icons";
import { CURRENCIES, DEFAULT_CURRENCY } from "../lib/currency";
import { PLAN_CATALOG, formatQuetzales } from "../lib/plans";
import { detectEmailProvider } from "../lib/supabase";

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

function IconEye({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  );
}

function IconEyeOff({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
    </svg>
  );
}

function generateSecurePassword(): string {
  const chars = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let pass = "Educa26$";
  for (let i = 0; i < 4; i++) {
    pass += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pass;
}

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
  currency: z.string().length(3),
  accept_terms: z
    .boolean()
    .refine((accepted) => accepted, {
      message: "Para crear la academia debes aceptar los Términos y la Política de Privacidad",
    }),
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
  const [showPassword, setShowPassword] = useState(false);
  const [copiedPassword, setCopiedPassword] = useState(false);

  const initialPlan =
    (searchParams.get("plan") as "free" | "starter" | "pro" | "scale") || "free";
  const [selectedPlan, setSelectedPlan] = useState<"free" | "starter" | "pro" | "scale">(
    initialPlan
  );

  const initialEmail =
    searchParams.get("email") ||
    searchParams.get("admin_email") ||
    (typeof window !== "undefined" ? localStorage.getItem("educa_saved_email") ?? "" : "");
  const initialName =
    searchParams.get("name") ||
    searchParams.get("admin_name") ||
    "";

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
      admin_name: initialName,
      admin_email: initialEmail,
      password: "",
      phone: "",
      currency: DEFAULT_CURRENCY,
      accept_terms: false,
    },
  });

  const watchAcademyName = watch("academy_name");
  const watchSlug = watch("slug");
  const watchAdminEmail = watch("admin_email") || "";
  const detectedEmailProvider = detectEmailProvider(watchAdminEmail);

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
      const emailTrimmed = values.admin_email.toLowerCase().trim();
      if (typeof window !== "undefined") {
        localStorage.setItem("educa_saved_email", emailTrimmed);
      }
      await registerAcademy({
        academy_name: values.academy_name,
        slug: values.slug.toLowerCase().trim(),
        admin_name: values.admin_name.trim(),
        admin_email: emailTrimmed,
        password: values.password,
        phone: values.phone ? values.phone.trim() : undefined,
        plan_tier: selectedPlan,
        currency: values.currency,
        accept_terms: values.accept_terms,
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
        <Link to="/" className="flex items-center gap-2.5">
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
                  : `Empiezas gratis (15 alumnos) y tu solicitud del plan ${PLAN_CATALOG[selectedPlan].name} queda registrada. Lo activamos al confirmar el pago.`}
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
                  <div className="font-extrabold text-slate-900">Q0/mes</div>
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
                  <div className="font-bold text-slate-900">{formatQuetzales(PLAN_CATALOG.starter.monthlyPrice)}/mes</div>
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
                  <div className="font-bold text-slate-900">{formatQuetzales(PLAN_CATALOG.pro.monthlyPrice)}/mes</div>
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
                  <div className="font-bold text-slate-900">{formatQuetzales(PLAN_CATALOG.scale.monthlyPrice)}/mes</div>
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
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-3">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Cuenta del Director / Administrador
                  </h2>
                  <span className="text-[11px] text-slate-500 flex items-center gap-1.5">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Compatible con Google y Microsoft (Outlook)
                  </span>
                </div>
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

                {/* Reconocimiento automático de Google / Outlook */}
                {detectedEmailProvider === "google" && (
                  <div className="mt-2 flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50/70 p-2.5 text-xs text-blue-900">
                    <GoogleSmallIcon />
                    <div>
                      <span className="font-semibold block text-blue-950">Cuenta de Google detectada</span>
                      <span className="text-[11px] text-blue-700">
                        Tu academia quedará lista para que entres con 1 clic usando Google desde cualquier equipo.
                      </span>
                    </div>
                  </div>
                )}

                {detectedEmailProvider === "azure" && (
                  <div className="mt-2 flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50/70 p-2.5 text-xs text-sky-900">
                    <MicrosoftSmallIcon />
                    <div>
                      <span className="font-semibold block text-sky-950">Cuenta de Microsoft / Outlook detectada</span>
                      <span className="text-[11px] text-sky-700">
                        Tu academia quedará lista para que entres con 1 clic usando Microsoft desde cualquier equipo.
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Password */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-medium text-slate-700">
                    Contraseña de Acceso *
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const generated = generateSecurePassword();
                      setValue("password", generated, { shouldValidate: true });
                      setShowPassword(true);
                      setCopiedPassword(true);
                      setTimeout(() => setCopiedPassword(false), 2500);
                    }}
                    className="text-[11px] font-medium text-brand-700 hover:text-brand-800 underline flex items-center gap-1"
                  >
                    {copiedPassword ? "✓ Contraseña generada" : "⚡ Sugerir contraseña segura"}
                  </button>
                </div>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="Mínimo 8 caracteres"
                    {...register("password")}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Ocultar contraseña" : "Ver contraseña"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
                  >
                    {showPassword ? <IconEyeOff /> : <IconEye />}
                  </button>
                </div>
                {errors.password && (
                  <p className="mt-1 text-xs text-red-600">
                    {errors.password.message}
                  </p>
                )}
              </div>

              {/* La moneda en que la academia cobra a sus alumnos */}
              <Field
                label="Moneda de tu academia"
                hint="En ella se registran cuotas, pagos, saldos, comprobantes y la nómina de profesores. Los planes de EDUCA se cobran en quetzales."
              >
                <Select {...register("currency")}>
                  {CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name} ({c.symbol} · {c.code})
                    </option>
                  ))}
                </Select>
              </Field>

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
                    : "Crear Academia y Solicitar Plan →"}
              </Button>

              <div>
                <label className="flex items-start gap-2.5 text-xs text-slate-600">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                    aria-invalid={errors.accept_terms ? true : undefined}
                    aria-describedby={errors.accept_terms ? "accept-terms-error" : undefined}
                    {...register("accept_terms")}
                  />
                  <span>
                    He leído y acepto, en nombre de la academia, los{" "}
                    <Link
                      to="/terminos"
                      target="_blank"
                      rel="noopener"
                      className="font-medium text-brand-700 underline"
                    >
                      Términos y Condiciones
                    </Link>{" "}
                    y la{" "}
                    <Link
                      to="/privacidad"
                      target="_blank"
                      rel="noopener"
                      className="font-medium text-brand-700 underline"
                    >
                      Política de Privacidad
                    </Link>
                    .
                  </span>
                </label>
                {errors.accept_terms && (
                  <p id="accept-terms-error" className="mt-1 text-xs text-red-600">
                    {errors.accept_terms.message}
                  </p>
                )}
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
                : `Todo incluido en el Plan ${PLAN_CATALOG[selectedPlan].name}:`}
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
              Mientras confirmamos tu pago trabajas en el Plan Gratis (hasta 15 alumnos), con todos tus datos guardados. Si decides no continuar con el plan de pago, sigues en el gratuito sin ningún cobro sorpresa.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
