import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  IconCheck,
  IconChevronDown,
  IconClose,
} from "../components/icons";

interface PlanTier {
  id: "free" | "starter" | "pro" | "scale";
  name: string;
  price: number;
  students: string;
  popular?: boolean;
  description: string;
  features: string[];
}

const PLANS: PlanTier[] = [
  {
    id: "free",
    name: "Gratis",
    price: 0,
    students: "Hasta 15 alumnos activos",
    description: "100% gratis para siempre. Diseñado para profesores independientes y academias que inician.",
    features: [
      "Hasta 15 alumnos activos para siempre",
      "Pase de lista y asistencia en vivo",
      "SpeedGrader para calificar tareas",
      "Portal del alumno anti-ansiedad",
      "Subdominio propio (tuacademia.educa.com)",
      "Gestión de horarios y aulas",
      "Sin tarjeta de crédito requerida",
    ],
  },
  {
    id: "starter",
    name: "Starter",
    price: 49,
    students: "Hasta 100 alumnos activos",
    description: "Ideal para academias en crecimiento que quieren erradicar el caos de WhatsApp.",
    features: [
      "Hasta 100 alumnos activos",
      "Profesores y cursos ilimitados",
      "SpeedGrader para docentes",
      "Importación masiva por Excel / CSV",
      "Pase de lista y asistencia en vivo",
      "Portal del alumno anti-ansiedad",
      "Subdominio propio (tuacademia.educa.com)",
      "0% comisiones por mensualidades",
    ],
  },
  {
    id: "pro",
    name: "Profesional",
    price: 129,
    students: "Hasta 300 alumnos activos",
    popular: true,
    description: "El más elegido por academias e institutos consolidados con múltiples profesores.",
    features: [
      "Hasta 300 alumnos activos",
      "Todo lo incluido en Starter",
      "Control de cobros y nómina de profesores",
      "Métricas de retención y alertas tempranas",
      "Soporte prioritario por WhatsApp",
      "Sesión de onboarding guiado para tu equipo",
      "Plantillas personalizadas de tareas y rúbricas",
    ],
  },
  {
    id: "scale",
    name: "Escala",
    price: 279,
    students: "Hasta 1,000 alumnos activos",
    description: "Para redes de academias, franquicias o centros educativos de alta escala.",
    features: [
      "Hasta 1,000 alumnos activos",
      "Todo lo incluido en Profesional",
      "Dominio propio (portal.tuacademia.com)",
      "Roles y permisos avanzados (asistentes, coordinadores)",
      "Gestor de cuenta y migración de datos asistida",
      "API y webhooks para integraciones personalizadas",
      "SLA de disponibilidad garantizado",
    ],
  },
];

const FAQS = [
  {
    q: "¿Qué incluye el Plan Gratuito de 15 alumnos y tiene fecha de caducidad?",
    a: "Es 100% gratis para siempre. Incluye todas las herramientas esenciales: gestión de cursos, control de horarios, SpeedGrader para corrección de tareas, pase de lista con cálculo automático de asistencias y el portal web para tus estudiantes. Sin tarjeta de crédito ni límite de tiempo.",
  },
  {
    q: "¿Qué ocurre cuando mi academia supera los 15 alumnos?",
    a: "Tu cuenta continúa activa y tus datos están seguros. Cuando decidas matricular al alumno número 16, el sistema te invitará amigablemente a pasar al plan Starter ($49/mes) para continuar admitiendo alumnos sin interrupciones.",
  },
  {
    q: "¿Tengo que cargar a mis alumnos y profesores uno por uno?",
    a: "No. Educa cuenta con una herramienta de importación masiva en CSV/Excel. Puedes subir tu lista actual de alumnos en 30 segundos y matricularlos a sus cursos de forma automática.",
  },
  {
    q: "¿Cobran comisión por las mensualidades que pagan mis alumnos?",
    a: "Cero comisiones. A diferencia de otras plataformas que retienen el 5% al 10% de tus ventas, con Educa pagas una tarifa plana fija mensual. El 100% del dinero de tus matrículas es tuyo.",
  },
  {
    q: "¿Qué sucede durante los 14 días de prueba gratis?",
    a: "Tienes acceso completo a todas las funciones sin restricciones y sin necesidad de ingresar tarjeta de crédito. Puedes invitar a tus profesores, cargar cursos y probar la experiencia con alumnos reales.",
  },
  {
    q: "¿Mis alumnos necesitan instalar una aplicación pesada?",
    a: "No. Educa funciona directamente en el navegador de cualquier teléfono (Android o iPhone), tableta o computadora. La interfaz es ultra ligera y está diseñada para cargar al instante incluso con conexiones móviles modestas.",
  },
  {
    q: "¿Qué diferencia a Educa de Google Classroom o Moodle?",
    a: "Google Classroom no tiene control de cobros, ni cálculo de horas de profesores, ni pase de lista para academias. Moodle es excesivamente complejo y requiere servidores caros y mantenimiento técnico. Educa fue diseñado específicamente para academias privadas: simple, hermoso y con gestión académica y operativa unificada.",
  },
];

export default function LandingPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<"director" | "profesores" | "alumnos">("director");
  const [studentCount, setStudentCount] = useState<number>(120);
  const [tuitionFee, setTuitionFee] = useState<number>(45);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [showDemoModal, setShowDemoModal] = useState<boolean>(false);

  // ROI calculations
  const monthlyRevenue = studentCount * tuitionFee;
  const adminHoursSaved = Math.round(studentCount * 0.25); // ~15 min saved per student/month
  const studentsRescued = Math.max(1, Math.round(studentCount * 0.04)); // 4% retention improvement
  const revenueRescued = studentsRescued * tuitionFee;

  const recommendedPlan =
    studentCount <= 15 ? "free" : studentCount <= 100 ? "starter" : studentCount <= 300 ? "pro" : "scale";

  return (
    <div className="min-h-screen bg-[#FDFBF7] text-slate-900 selection:bg-brand-500 selection:text-white">
      {/* -------------------- Topbar Navigation -------------------- */}
      <header className="sticky top-0 z-40 border-b border-stone-200/80 bg-[#FDFBF7]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <Link to="/landing" className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 font-serif text-xl font-bold text-white shadow-sm shadow-brand-600/30">
              E
            </div>
            <div className="flex flex-col">
              <span className="font-serif text-xl font-bold tracking-tight text-slate-900">
                Educa
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-widest text-brand-700">
                SaaS Académico
              </span>
            </div>
          </Link>

          <nav className="hidden items-center gap-8 md:flex">
            <a
              href="#beneficios"
              className="text-sm font-medium text-slate-600 transition hover:text-brand-700"
            >
              Beneficios
            </a>
            <a
              href="#modulos"
              className="text-sm font-medium text-slate-600 transition hover:text-brand-700"
            >
              Para Quién Es
            </a>
            <a
              href="#comparativa"
              className="text-sm font-medium text-slate-600 transition hover:text-brand-700"
            >
              Comparativa
            </a>
            <a
              href="#calculadora"
              className="text-sm font-medium text-slate-600 transition hover:text-brand-700"
            >
              Calculadora ROI
            </a>
            <a
              href="#precios"
              className="text-sm font-medium text-slate-600 transition hover:text-brand-700"
            >
              Precios
            </a>
            <a
              href="#faq"
              className="text-sm font-medium text-slate-600 transition hover:text-brand-700"
            >
              Preguntas
            </a>
          </nav>

          <div className="flex items-center gap-3">
            <Link
              to="/login"
              className="rounded-lg px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-stone-200/60 hover:text-slate-900"
            >
              Iniciar Sesión
            </Link>
            <button
              onClick={() => navigate("/crear-academia")}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              Crear Academia
            </button>
          </div>
        </div>
      </header>

      {/* -------------------- Hero Section -------------------- */}
      <section className="relative overflow-hidden px-4 pb-16 pt-12 sm:px-6 sm:pb-24 sm:pt-20 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50/80 px-3.5 py-1 text-xs font-semibold text-brand-800">
            <span className="flex h-2 w-2 rounded-full bg-brand-600" />
            14 días de prueba gratis • Sin tarjeta requerida
          </div>

          <h1 className="mt-6 font-serif text-4xl font-semibold tracking-tight text-slate-900 sm:text-6xl sm:leading-[1.12]">
            El sistema operativo para academias que elimina el caos de{" "}
            <span className="text-brand-700 underline decoration-brand-300 decoration-wavy underline-offset-4">
              WhatsApp y Excel
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-600 sm:text-xl">
            Asistencia en tiempo real, SpeedGrader docente, recibos inmutables de
            tareas para alumnos y control de cobros sin comisiones. Todo en tu
            propio subdominio en menos de 15 minutos.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
            <button
              onClick={() => navigate("/crear-academia")}
              className="w-full rounded-xl bg-brand-600 px-7 py-3.5 text-base font-semibold text-white shadow-lg shadow-brand-600/25 transition hover:bg-brand-700 sm:w-auto"
            >
              Comenzar 14 Días Gratis →
            </button>
            <button
              onClick={() => setShowDemoModal(true)}
              className="w-full rounded-xl border border-stone-300 bg-white px-6 py-3.5 text-base font-semibold text-slate-700 shadow-sm transition hover:bg-stone-50 sm:w-auto"
            >
              Ver Demostración en Vivo
            </button>
          </div>

          <div className="mt-10 grid grid-cols-2 gap-4 text-left sm:grid-cols-4 sm:gap-6">
            <div className="rounded-xl border border-stone-200/90 bg-white/70 p-3.5 shadow-sm">
              <div className="text-xl">⚡</div>
              <div className="mt-1 font-semibold text-slate-900">Listo en 15 min</div>
              <div className="text-xs text-slate-500">Configuración guiada paso a paso</div>
            </div>
            <div className="rounded-xl border border-stone-200/90 bg-white/70 p-3.5 shadow-sm">
              <div className="text-xl">📥</div>
              <div className="mt-1 font-semibold text-slate-900">Importación Masiva</div>
              <div className="text-xs text-slate-500">Sube tus listas desde Excel o CSV</div>
            </div>
            <div className="rounded-xl border border-stone-200/90 bg-white/70 p-3.5 shadow-sm">
              <div className="text-xl">💳</div>
              <div className="mt-1 font-semibold text-slate-900">0% Comisiones</div>
              <div className="text-xs text-slate-500">El 100% de tus cobros es tuyo</div>
            </div>
            <div className="rounded-xl border border-stone-200/90 bg-white/70 p-3.5 shadow-sm">
              <div className="text-xl">🔒</div>
              <div className="mt-1 font-semibold text-slate-900">Multi-Tenant Seguro</div>
              <div className="text-xs text-slate-500">Base de datos aislada por academia</div>
            </div>
          </div>
        </div>
      </section>

      {/* -------------------- Interactive Role Showcase -------------------- */}
      <section id="modulos" className="border-t border-stone-200 bg-white py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="font-serif text-3xl font-semibold text-slate-900 sm:text-4xl">
              Diseñado a la medida de cada rol en tu institución
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-slate-600">
              Menos pantallas confusas, más claridad operativa. Así experimenta Educa cada miembro de tu academia:
            </p>

            {/* Tab Controls */}
            <div className="mt-8 inline-flex rounded-xl bg-stone-100 p-1.5 shadow-inner">
              <button
                onClick={() => setActiveTab("director")}
                className={`rounded-lg px-5 py-2.5 text-sm font-semibold transition ${
                  activeTab === "director"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                👔 Director / Administrador
              </button>
              <button
                onClick={() => setActiveTab("profesores")}
                className={`rounded-lg px-5 py-2.5 text-sm font-semibold transition ${
                  activeTab === "profesores"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                👩‍🏫 Profesores & Calificación
              </button>
              <button
                onClick={() => setActiveTab("alumnos")}
                className={`rounded-lg px-5 py-2.5 text-sm font-semibold transition ${
                  activeTab === "alumnos"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                🎓 Alumnos & Entregas
              </button>
            </div>
          </div>

          {/* Active Tab Showcase Content */}
          <div className="mt-12 rounded-2xl border border-stone-200 bg-[#FDFBF7] p-6 shadow-sm sm:p-10">
            {activeTab === "director" && (
              <div className="grid items-center gap-8 lg:grid-cols-12">
                <div className="space-y-5 lg:col-span-5">
                  <div className="inline-block rounded-md bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">
                    Control Integral de la Academia
                  </div>
                  <h3 className="font-serif text-2xl font-bold text-slate-900">
                    Sabe exactamente qué ocurre en tus aulas en tiempo real
                  </h3>
                  <p className="text-slate-600">
                    Nunca más persigas a tus profesores para saber si asistieron o si ya pasaron lista. Consulta métricas de asistencia, alumnos con riesgo de deserción y estados de cuotas en un panel unificado.
                  </p>
                  <ul className="space-y-3 text-sm text-slate-700">
                    <li className="flex items-start gap-2">
                      <span className="text-brand-600">✓</span>
                      <span><strong>Importación masiva:</strong> Carga 200 alumnos con su curso asignado en 1 clic.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-brand-600">✓</span>
                      <span><strong>Nómina docente automatizada:</strong> Cálculo de horas impartidas por profesor.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-brand-600">✓</span>
                      <span><strong>Control de sedes y aulas:</strong> Disponibilidad horaria sin choques de horarios.</span>
                    </li>
                  </ul>
                </div>
                <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-md lg:col-span-7">
                  <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                    <div className="font-bold text-slate-800">Resumen Operativo del Día</div>
                    <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                      En vivo
                    </span>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-3">
                    <div className="rounded-lg bg-stone-50 p-3 text-center">
                      <div className="text-2xl font-bold text-slate-900">96.4%</div>
                      <div className="text-xs text-slate-500">Asistencia Global</div>
                    </div>
                    <div className="rounded-lg bg-stone-50 p-3 text-center">
                      <div className="text-2xl font-bold text-brand-600">18</div>
                      <div className="text-xs text-slate-500">Clases Hoy</div>
                    </div>
                    <div className="rounded-lg bg-stone-50 p-3 text-center">
                      <div className="text-2xl font-bold text-amber-600">3</div>
                      <div className="text-xs text-slate-500">Alertas de Ausencia</div>
                    </div>
                  </div>
                  <div className="mt-4 space-y-2 text-xs">
                    <div className="flex items-center justify-between rounded border border-stone-100 p-2.5">
                      <span className="font-medium text-slate-700">Inglés Conversacional B2 (18:00)</span>
                      <span className="font-semibold text-emerald-600">Lista pasada (14/15 presentes)</span>
                    </div>
                    <div className="flex items-center justify-between rounded border border-stone-100 p-2.5">
                      <span className="font-medium text-slate-700">Desarrollo Web Fullstack (19:00)</span>
                      <span className="font-semibold text-brand-600">En curso (Prof. Ricardo M.)</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "profesores" && (
              <div className="grid items-center gap-8 lg:grid-cols-12">
                <div className="space-y-5 lg:col-span-5">
                  <div className="inline-block rounded-md bg-blue-100 px-3 py-1 text-xs font-bold text-blue-800">
                    Productividad Docente
                  </div>
                  <h3 className="font-serif text-2xl font-bold text-slate-900">
                    SpeedGrader: Califica 30 tareas en menos de 10 minutos
                  </h3>
                  <p className="text-slate-600">
                    Se acabaron las horas nocturnas descargando archivos de WhatsApp uno por uno. Nuestro SpeedGrader permite ver el trabajo del alumno, asignar puntaje y enviar feedback con atajos de teclado rápidos (<code className="rounded bg-stone-100 px-1 py-0.5 text-xs font-semibold">Cmd+Enter</code>).
                  </p>
                  <ul className="space-y-3 text-sm text-slate-700">
                    <li className="flex items-start gap-2">
                      <span className="text-brand-600">✓</span>
                      <span><strong>Pase de lista en 2 toques:</strong> Con soporte offline si falla el internet.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-brand-600">✓</span>
                      <span><strong>Chips de feedback rápido:</strong> "¡Excelente análisis!", "Buen trabajo".</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-brand-600">✓</span>
                      <span><strong>Filtros inmediatos:</strong> Pendientes, entregados fuera de plazo y evaluados.</span>
                    </li>
                  </ul>
                </div>
                <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-md lg:col-span-7">
                  <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                    <div className="font-bold text-slate-800">SpeedGrader • Ensayo Argumentativo</div>
                    <span className="rounded bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">
                      Alumno 14 de 22
                    </span>
                  </div>
                  <div className="mt-4 rounded-lg border border-dashed border-stone-300 bg-stone-50 p-4 text-center">
                    <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Documento del Alumno
                    </div>
                    <div className="mt-1 font-medium text-slate-800">
                      ensayo_sofia_martinez_v2.pdf (1.4 MB)
                    </div>
                    <p className="mt-2 text-xs italic text-slate-600">
                      "Análisis sobre la evolución de la gramática inglesa moderna..."
                    </p>
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-500">Nota:</span>
                      <span className="rounded border border-stone-300 bg-stone-50 px-3 py-1 font-bold text-slate-900">
                        95 / 100
                      </span>
                    </div>
                    <div className="text-xs text-slate-500">
                      Guardar y siguiente: <kbd className="rounded bg-stone-100 px-1 font-semibold text-slate-700">⌘ + Enter</kbd>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "alumnos" && (
              <div className="grid items-center gap-8 lg:grid-cols-12">
                <div className="space-y-5 lg:col-span-5">
                  <div className="inline-block rounded-md bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
                    Experiencia Estudiantil Anti-Ansiedad
                  </div>
                  <h3 className="font-serif text-2xl font-bold text-slate-900">
                    Entregas seguras con confirmación y recibo inmutable
                  </h3>
                  <p className="text-slate-600">
                    Los alumnos siempre temen que su tarea no se haya subido a tiempo o se pierda. Educa emite un comprobante digital inmediato con marca de tiempo garantizada, reduciendo el 90% de los reclamos.
                  </p>
                  <ul className="space-y-3 text-sm text-slate-700">
                    <li className="flex items-start gap-2">
                      <span className="text-brand-600">✓</span>
                      <span><strong>Arrastrar y soltar:</strong> Soporte para PDFs, imágenes, enlaces de Drive o texto.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-brand-600">✓</span>
                      <span><strong>Plazos relativos claros:</strong> "Vence hoy a las 23:59" en vez de fechas crípticas.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-brand-600">✓</span>
                      <span><strong>Acceso móvil instantáneo:</strong> Sin contraseñas complicadas ni caídas.</span>
                    </li>
                  </ul>
                </div>
                <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-md lg:col-span-7">
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-4">
                    <div className="flex items-center gap-2 text-emerald-800 font-bold text-sm">
                      <IconCheck className="h-5 w-5 text-emerald-600" />
                      ¡Entrega Confirmada con Éxito!
                    </div>
                    <div className="mt-2 text-xs text-emerald-700">
                      Tu archivo ha quedado registrado de manera inmutable en los servidores de la institución.
                    </div>
                    <div className="mt-3 rounded bg-white p-2.5 text-xs text-slate-600 shadow-xs border border-emerald-100">
                      <div><strong>Archivo:</strong> proyecto_final_modulo2.zip (3.8 MB)</div>
                      <div className="mt-0.5"><strong>Recibo:</strong> #ED-2026-9812 • 27 Sep 2026, 17:42</div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* -------------------- Direct Comparison Table -------------------- */}
      <section id="comparativa" className="border-t border-stone-200 bg-[#FDFBF7] py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="font-serif text-3xl font-semibold text-slate-900 sm:text-4xl">
              ¿Por qué las academias migran a Educa?
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-slate-600">
              Compara cómo manejas tu academia hoy frente a la experiencia unificada de Educa:
            </p>
          </div>

          <div className="mt-12 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-stone-200 bg-stone-50 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  <tr>
                    <th className="p-4 sm:p-5">Criterio Operativo</th>
                    <th className="p-4 sm:p-5 text-brand-700 bg-brand-50/60 font-bold">
                      ⭐ Educa SaaS
                    </th>
                    <th className="p-4 sm:p-5 text-slate-500">WhatsApp + Excel</th>
                    <th className="p-4 sm:p-5 text-slate-500">Moodle / Classroom</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200 text-slate-700">
                  <tr>
                    <td className="p-4 sm:p-5 font-semibold text-slate-900">
                      Entrega y recepción de tareas
                    </td>
                    <td className="p-4 sm:p-5 bg-brand-50/30 text-emerald-800 font-medium">
                      ✓ Recibo digital inmutable en 2 clics
                    </td>
                    <td className="p-4 sm:p-5 text-red-600">
                      ✗ Archivos perdidos en chats privados
                    </td>
                    <td className="p-4 sm:p-5 text-amber-700">
                      ⚠ Formularios toscos y confusos
                    </td>
                  </tr>
                  <tr>
                    <td className="p-4 sm:p-5 font-semibold text-slate-900">
                      Pase de lista y asistencia
                    </td>
                    <td className="p-4 sm:p-5 bg-brand-50/30 text-emerald-800 font-medium">
                      ✓ En vivo, offline-ready con alertas al director
                    </td>
                    <td className="p-4 sm:p-5 text-red-600">
                      ✗ Planillas de papel o WhatsApp desordenado
                    </td>
                    <td className="p-4 sm:p-5 text-amber-700">
                      ⚠ Requiere plugins complejos
                    </td>
                  </tr>
                  <tr>
                    <td className="p-4 sm:p-5 font-semibold text-slate-900">
                      Velocidad de calificación
                    </td>
                    <td className="p-4 sm:p-5 bg-brand-50/30 text-emerald-800 font-medium">
                      ✓ SpeedGrader con atajos Cmd+Enter
                    </td>
                    <td className="p-4 sm:p-5 text-red-600">
                      ✗ 3 horas descargando fotos de cuadernos
                    </td>
                    <td className="p-4 sm:p-5 text-amber-700">
                      ⚠ Múltiples clics por cada estudiante
                    </td>
                  </tr>
                  <tr>
                    <td className="p-4 sm:p-5 font-semibold text-slate-900">
                      Control de cobros & nómina
                    </td>
                    <td className="p-4 sm:p-5 bg-brand-50/30 text-emerald-800 font-medium">
                      ✓ Integrado al expediente del alumno
                    </td>
                    <td className="p-4 sm:p-5 text-red-600">
                      ✗ Excel desactualizado con cobros olvidados
                    </td>
                    <td className="p-4 sm:p-5 text-red-600">
                      ✗ No existe módulo financiero
                    </td>
                  </tr>
                  <tr>
                    <td className="p-4 sm:p-5 font-semibold text-slate-900">
                      Puesta en marcha
                    </td>
                    <td className="p-4 sm:p-5 bg-brand-50/30 text-emerald-800 font-bold">
                      ✓ 15 minutos (Importador CSV incluido)
                    </td>
                    <td className="p-4 sm:p-5 text-slate-500">
                      Inmediato pero caótico día a día
                    </td>
                    <td className="p-4 sm:p-5 text-red-600">
                      ✗ Semanas de consultoría y servidores
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* -------------------- Interactive ROI Calculator -------------------- */}
      <section id="calculadora" className="border-t border-stone-200 bg-white py-16 sm:py-24">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <div className="inline-block rounded-full bg-emerald-100 px-3.5 py-1 text-xs font-semibold text-emerald-800">
              Calculadora de Impacto Económico
            </div>
            <h2 className="mt-3 font-serif text-3xl font-semibold text-slate-900 sm:text-4xl">
              Calcula el ahorro y retorno para tu academia
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-slate-600">
              Mueve los deslizadores según la realidad de tu centro educativo:
            </p>
          </div>

          <div className="mt-12 rounded-2xl border border-stone-200 bg-[#FDFBF7] p-6 shadow-sm sm:p-10">
            <div className="grid gap-8 md:grid-cols-2">
              {/* Sliders */}
              <div className="space-y-6">
                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-semibold text-slate-800">
                      Alumnos activos en la academia
                    </label>
                    <span className="text-lg font-bold text-brand-600">{studentCount} alumnos</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="600"
                    step="5"
                    value={studentCount}
                    onChange={(e) => setStudentCount(Number(e.target.value))}
                    className="mt-3 w-full accent-brand-600"
                  />
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>10</span>
                    <span>300</span>
                    <span>600+</span>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-semibold text-slate-800">
                      Mensualidad promedio por alumno
                    </label>
                    <span className="text-lg font-bold text-brand-600">${tuitionFee} USD/mes</span>
                  </div>
                  <input
                    type="range"
                    min="15"
                    max="150"
                    step="5"
                    value={tuitionFee}
                    onChange={(e) => setTuitionFee(Number(e.target.value))}
                    className="mt-3 w-full accent-brand-600"
                  />
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>$15</span>
                    <span>$75</span>
                    <span>$150+</span>
                  </div>
                </div>

                <div className="rounded-xl border border-stone-200 bg-white p-4 text-xs text-slate-500">
                  💡 <strong>¿Cómo se calcula?</strong> El sistema ahorra ~15 minutos de trabajo manual por estudiante al mes (mensajes, cobros, tareas) y reduce la deserción estudiantil al alertar sobre ausencias repetidas.
                </div>
              </div>

              {/* Calculated Results */}
              <div className="flex flex-col justify-between rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Impacto Mensual Estimado • Facturación: ${monthlyRevenue.toLocaleString()} USD
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-4">
                    <div className="rounded-lg bg-emerald-50/70 p-3.5">
                      <div className="text-2xl font-black text-emerald-700">+{adminHoursSaved} hrs</div>
                      <div className="text-xs text-emerald-900 font-medium">Horas de gestión ahorradas al mes</div>
                    </div>
                    <div className="rounded-lg bg-brand-50/70 p-3.5">
                      <div className="text-2xl font-black text-brand-700">+${revenueRescued} USD</div>
                      <div className="text-xs text-brand-900 font-medium">Ingresos retenidos por menor deserción</div>
                    </div>
                  </div>

                  <div className="mt-6 border-t border-stone-100 pt-4">
                    <div className="text-xs text-slate-500">Plan recomendado para tu volumen:</div>
                    <div className="mt-1 flex items-baseline gap-2">
                      <span className="text-xl font-bold text-slate-900 capitalize">
                        Plan {recommendedPlan}
                      </span>
                      <span className="text-sm font-semibold text-brand-600">
                        ({recommendedPlan === "free" ? "100% Gratis para siempre" : `$${PLANS.find((p) => p.id === recommendedPlan)?.price}/mes`})
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => navigate(`/crear-academia?plan=${recommendedPlan}`)}
                  className="mt-6 w-full rounded-lg bg-brand-600 py-3 text-center text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
                >
                  {recommendedPlan === "free"
                    ? "Comenzar en el Plan Gratis (15 alumnos) →"
                    : `Probar Plan ${recommendedPlan.toUpperCase()} Gratis por 14 Días →`}
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* -------------------- Pricing Section -------------------- */}
      <section id="precios" className="border-t border-stone-200 bg-[#FDFBF7] py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="font-serif text-3xl font-semibold text-slate-900 sm:text-4xl">
              Precios simples, transparentes y sin sorpresas
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-slate-600">
              14 días de prueba gratis en todos los planes. Cancela o cambia de plan cuando quieras sin contratos forzosos.
            </p>
          </div>

          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {PLANS.map((plan) => (
              <div
                key={plan.id}
                className={`relative flex flex-col justify-between rounded-2xl border bg-white p-6 shadow-sm transition hover:shadow-md ${
                  plan.popular
                    ? "border-brand-500 ring-2 ring-brand-500/20"
                    : plan.id === "free"
                      ? "border-emerald-200 bg-emerald-50/20"
                      : "border-stone-200"
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-brand-600 px-3.5 py-1 text-xs font-bold text-white shadow-sm">
                    MÁS ELEGIDO POR DIRECTORES
                  </div>
                )}
                {plan.id === "free" && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-emerald-600 px-3 py-0.5 text-[11px] font-bold text-white shadow-sm">
                    100% GRATIS
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between">
                    <h3 className="text-xl font-bold text-slate-900">{plan.name}</h3>
                  </div>
                  <div className="mt-2 text-xs font-semibold text-brand-700">
                    {plan.students}
                  </div>
                  <p className="mt-3 text-xs text-slate-500">{plan.description}</p>

                  <div className="mt-6 flex items-baseline">
                    <span className="font-serif text-4xl font-extrabold text-slate-900">
                      {plan.price === 0 ? "$0" : `$${plan.price}`}
                    </span>
                    <span className="ml-1 text-sm font-medium text-slate-500">
                      {plan.price === 0 ? "para siempre" : "USD / mes"}
                    </span>
                  </div>

                  <ul className="mt-6 space-y-3 text-xs text-slate-600">
                    {plan.features.map((f, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <IconCheck className="h-4 w-4 shrink-0 text-emerald-600" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-8 border-t border-stone-100 pt-5">
                  <button
                    onClick={() => navigate(`/crear-academia?plan=${plan.id}`)}
                    className={`w-full rounded-lg py-2.5 text-center text-sm font-semibold transition ${
                      plan.popular
                        ? "bg-brand-600 text-white hover:bg-brand-700 shadow-sm"
                        : plan.id === "free"
                          ? "bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm"
                          : "border border-stone-300 bg-stone-50 text-slate-700 hover:bg-stone-100"
                    }`}
                  >
                    {plan.id === "free" ? "Comenzar Gratis (15 alumnos)" : `Elegir ${plan.name} (14 días gratis)`}
                  </button>
                  <div className="mt-2 text-center text-[11px] text-slate-400">
                    {plan.id === "free" ? "Sin tarjeta • Acceso inmediato" : "Sin tarjeta • Activación en 1 minuto"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* -------------------- FAQ Section -------------------- */}
      <section id="faq" className="border-t border-stone-200 bg-white py-16 sm:py-24">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="font-serif text-3xl font-semibold text-slate-900 sm:text-4xl">
              Preguntas Frecuentes de Directores
            </h2>
            <p className="mt-2 text-slate-600">
              Todo lo que necesitas saber antes de dar el paso:
            </p>
          </div>

          <div className="mt-10 divide-y divide-stone-200 rounded-2xl border border-stone-200 bg-[#FDFBF7]">
            {FAQS.map((faq, idx) => {
              const isOpen = openFaq === idx;
              return (
                <div key={idx} className="p-5">
                  <button
                    onClick={() => setOpenFaq(isOpen ? null : idx)}
                    className="flex w-full items-center justify-between text-left font-semibold text-slate-900"
                  >
                    <span>{faq.q}</span>
                    <IconChevronDown
                      className={`h-4 w-4 text-slate-400 transition-transform ${
                        isOpen ? "rotate-180" : ""
                      }`}
                    />
                  </button>
                  {isOpen && (
                    <p className="mt-3 text-sm leading-relaxed text-slate-600">
                      {faq.a}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* -------------------- Bottom CTA Banner -------------------- */}
      <section className="bg-brand-900 px-4 py-16 text-center text-white sm:px-6 sm:py-20 lg:px-8">
        <div className="mx-auto max-w-3xl">
          <h2 className="font-serif text-3xl font-semibold sm:text-5xl">
            Lleva tu academia al siguiente nivel hoy mismo
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base text-brand-100 sm:text-lg">
            Únete a los directores que recuperaron su tranquilidad, mejoraron sus calificaciones y eliminaron el caos operativo con Educa.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <button
              onClick={() => navigate("/crear-academia")}
              className="rounded-xl bg-white px-8 py-3.5 text-base font-bold text-brand-900 shadow-lg transition hover:bg-stone-100"
            >
              Crear mi Academia (14 Días Gratis) →
            </button>
          </div>
          <p className="mt-4 text-xs text-brand-200">
            Configuración en 15 minutos • Sin tarjeta de crédito requerida
          </p>
        </div>
      </section>

      {/* -------------------- Footer -------------------- */}
      <footer className="border-t border-stone-200 bg-stone-900 py-12 text-stone-400">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 font-serif text-base font-bold text-white">
                E
              </div>
              <span className="font-serif text-lg font-bold text-white">Educa</span>
              <span className="ml-2 text-xs text-stone-500">
                © {new Date().getFullYear()} Educa Technologies Inc.
              </span>
            </div>
            <div className="flex items-center gap-6 text-xs">
              <Link to="/login" className="hover:text-white">
                Ingreso a Clases
              </Link>
              <Link to="/crear-academia" className="hover:text-white">
                Registro de Nueva Academia
              </Link>
              <a href="#precios" className="hover:text-white">
                Planes
              </a>
              <a href="#faq" className="hover:text-white">
                Soporte
              </a>
            </div>
          </div>
        </div>
      </footer>

      {/* -------------------- Demo Video Modal -------------------- */}
      {showDemoModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
        >
          <div className="relative w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl">
            <button
              onClick={() => setShowDemoModal(false)}
              className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-400 hover:bg-stone-100 hover:text-slate-600"
            >
              <IconClose className="h-5 w-5" />
            </button>
            <h3 className="font-serif text-xl font-bold text-slate-900">
              Demostración Guiada de Educa
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Recorrido en 2 minutos por el panel del director, SpeedGrader y entregas de alumnos.
            </p>
            <div className="mt-4 aspect-video rounded-xl bg-slate-900 flex flex-col items-center justify-center text-white p-6 text-center">
              <div className="text-4xl mb-2">▶️</div>
              <div className="font-semibold text-lg">Paseo Interactivo por la Plataforma</div>
              <p className="text-xs text-slate-300 max-w-md mt-2">
                Descubre cómo un director importa sus 300 alumnos en 30 segundos y cómo los profesores califican usando solo el teclado.
              </p>
              <button
                onClick={() => {
                  setShowDemoModal(false);
                  navigate("/crear-academia");
                }}
                className="mt-5 rounded-lg bg-brand-600 px-5 py-2 text-xs font-bold text-white hover:bg-brand-700"
              >
                Pruébalo Tú Mismo en Vivo (14 Días Gratis)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
