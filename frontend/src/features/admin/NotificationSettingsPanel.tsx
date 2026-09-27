import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import {
  Badge,
  Button,
  Card,
  Input,
  PageHeader,
  SegmentedControl,
  Select,
} from "../../components/ui";
import {
  IconAlert,
  IconCheck,
} from "../../components/icons";
import { api, apiErrorMessage } from "../../lib/api";
import { notify } from "../../lib/toast";
import type {
  NotificationSettings,
  NotificationSettingsUpdatePayload,
} from "../../lib/types";

const COUNTRY_CODES = [
  { code: "502", label: "🇬🇹 Guatemala (+502)" },
  { code: "52", label: "🇲🇽 México (+52)" },
  { code: "57", label: "🇨🇴 Colombia (+57)" },
  { code: "54", label: "🇦🇷 Argentina (+54)" },
  { code: "1", label: "🇺🇸 Estados Unidos / Canadá (+1)" },
  { code: "34", label: "🇪🇸 España (+34)" },
  { code: "503", label: "🇸🇻 El Salvador (+503)" },
  { code: "504", label: "🇭🇳 Honduras (+504)" },
  { code: "506", label: "🇨🇷 Costa Rica (+506)" },
  { code: "507", label: "🇵🇦 Panamá (+507)" },
  { code: "51", label: "🇵🇪 Perú (+51)" },
  { code: "56", label: "🇨🇱 Chile (+56)" },
  { code: "593", label: "🇪🇨 Ecuador (+593)" },
];

export function NotificationSettingsPanel() {
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery<NotificationSettings>({
    queryKey: ["notification_settings"],
    queryFn: async () => {
      const res = await api.get<NotificationSettings>("/notifications/settings");
      return res.data;
    },
  });

  // Local form state
  const [whatsappEnabled, setWhatsappEnabled] = useState(true);
  const [whatsappMode, setWhatsappMode] = useState<"managed" | "custom">("managed");
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [whatsappToken, setWhatsappToken] = useState("");
  const [countryCode, setCountryCode] = useState("502");
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [pushEnabled, setPushEnabled] = useState(true);

  // Trigger toggles
  const [triggers, setTriggers] = useState<Record<string, boolean>>({
    class_cancelled: true,
    class_rescheduled: true,
    at_risk_absences: true,
    assignment_reminder: true,
    payment_reminder: true,
  });

  // Test state
  const [testPhone, setTestPhone] = useState("");
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  // Populate state when data loads
  useEffect(() => {
    if (settings) {
      setWhatsappEnabled(settings.whatsapp_enabled);
      setWhatsappMode(settings.whatsapp_mode);
      setPhoneNumberId(settings.whatsapp_phone_number_id || "");
      setCountryCode(settings.whatsapp_default_country_code || "502");
      setEmailEnabled(settings.email_enabled);
      setPushEnabled(settings.push_enabled);
      if (settings.triggers) {
        setTriggers(settings.triggers);
      }
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async (payload: NotificationSettingsUpdatePayload) => {
      const res = await api.put<NotificationSettings>(
        "/notifications/settings",
        payload
      );
      return res.data;
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(["notification_settings"], updated);
      notify("Configuración de notificaciones guardada exitosamente", "success");
    },
    onError: (err) => {
      notify(
        apiErrorMessage(err, "Error al guardar la configuración de notificaciones"),
        "error"
      );
    },
  });

  async function handleSave() {
    saveMutation.mutate({
      whatsapp_enabled: whatsappEnabled,
      whatsapp_mode: whatsappMode,
      whatsapp_phone_number_id:
        whatsappMode === "custom" ? phoneNumberId : undefined,
      whatsapp_token:
        whatsappMode === "custom" && whatsappToken.trim()
          ? whatsappToken.trim()
          : undefined,
      whatsapp_default_country_code: countryCode,
      email_enabled: emailEnabled,
      push_enabled: pushEnabled,
      triggers,
    });
  }

  async function handleSendTest() {
    if (!testPhone.trim()) {
      notify("Por favor ingresa un número de teléfono para la prueba", "error");
      return;
    }
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await api.post<{ success: boolean; message: string }>(
        "/notifications/settings/test-whatsapp",
        { phone: testPhone }
      );
      setTestResult(res.data);
      if (res.data.success) {
        notify(res.data.message, "success");
      } else {
        notify(res.data.message, "error");
      }
    } catch (err) {
      const msg = apiErrorMessage(err, "Error al enviar mensaje de prueba");
      setTestResult({ success: false, message: msg });
      notify(msg, "error");
    } finally {
      setIsTesting(false);
    }
  }

  const toggleTrigger = (key: string) => {
    setTriggers((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center text-slate-400">
        Cargando configuración de notificaciones…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notificaciones & WhatsApp"
        description="Gestiona cómo se envían los avisos automáticos a tus alumnos y profesores."
        actions={
          <div className="flex items-center gap-2">
            <Badge color={whatsappEnabled ? "green" : "slate"} dot>
              {whatsappEnabled ? "WhatsApp Activo" : "WhatsApp Desactivado"}
            </Badge>
          </div>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Canal WhatsApp
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900">
              {whatsappEnabled ? "Habilitado" : "Pausado"}
            </span>
            <span className="text-xs font-medium text-brand-600">
              {whatsappMode === "managed" ? "Pasarela EDUCA" : "Meta Propia"}
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {whatsappEnabled
              ? "Los avisos salientes se envían automáticamente al número de cada alumno."
              : "Los mensajes salientes por WhatsApp están detenidos."}
          </p>
        </Card>

        <Card className="p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Alumnos con WhatsApp Activo
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-brand-700">
              {settings?.students_with_whatsapp ?? 0}
            </span>
            <span className="text-xs text-slate-500">
              de {settings?.total_students ?? 0} alumnos
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Alumnos con teléfono válido y consentimiento registrado en el sistema.
          </p>
        </Card>

        <Card className="p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Mensajes Entregados (30 Días)
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-emerald-600">
              {settings?.messages_sent_30d ?? 0}
            </span>
            <span className="text-xs text-slate-500">envíos exitosos</span>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Tasa de entrega &gt; 99% mediante la infraestructura de Meta.
          </p>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left Column: Channels & Meta Config */}
        <div className="space-y-6 lg:col-span-7">
          {/* Active Channels Card */}
          <Card className="space-y-4">
            <h2 className="text-base font-bold text-slate-900">
              Canales de Comunicación
            </h2>
            <p className="text-xs text-slate-500">
              Elige por qué vías tu academia mantendrá informada a su comunidad:
            </p>

            <div className="divide-y divide-stone-100 rounded-lg border border-stone-200 bg-stone-50/50">
              {/* WhatsApp Toggle */}
              <div className="flex items-center justify-between p-3.5">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-lg">
                    💬
                  </span>
                  <div>
                    <div className="text-sm font-semibold text-slate-900">
                      Mensajes por WhatsApp (Cloud API)
                    </div>
                    <div className="text-xs text-slate-500">
                      Avisos de clases, tareas y alertas de inasistencia en el chat del alumno.
                    </div>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={whatsappEnabled}
                  onChange={(e) => setWhatsappEnabled(e.target.checked)}
                  className="h-5 w-5 rounded accent-brand-600 cursor-pointer"
                />
              </div>

              {/* Email Toggle */}
              <div className="flex items-center justify-between p-3.5">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100 text-lg">
                    📧
                  </span>
                  <div>
                    <div className="text-sm font-semibold text-slate-900">
                      Correo Electrónico Transaccional
                    </div>
                    <div className="text-xs text-slate-500">
                      Recibos de entrega de tareas y resúmenes de calificaciones.
                    </div>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={emailEnabled}
                  onChange={(e) => setEmailEnabled(e.target.checked)}
                  className="h-5 w-5 rounded accent-brand-600 cursor-pointer"
                />
              </div>

              {/* Push Toggle */}
              <div className="flex items-center justify-between p-3.5">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-100 text-lg">
                    📱
                  </span>
                  <div>
                    <div className="text-sm font-semibold text-slate-900">
                      Notificaciones Push en Navegador / Celular
                    </div>
                    <div className="text-xs text-slate-500">
                      Alertas instantáneas en pantalla incluso con la app cerrada.
                    </div>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={pushEnabled}
                  onChange={(e) => setPushEnabled(e.target.checked)}
                  className="h-5 w-5 rounded accent-brand-600 cursor-pointer"
                />
              </div>

              {/* In-App Bell */}
              <div className="flex items-center justify-between p-3.5 opacity-80">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-stone-200 text-lg">
                    🔔
                  </span>
                  <div>
                    <div className="text-sm font-semibold text-slate-900">
                      Campana de Notificaciones en la Plataforma
                    </div>
                    <div className="text-xs text-slate-500">
                      Bandeja interna de avisos y novedades del sistema (Siempre activo).
                    </div>
                  </div>
                </div>
                <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                  Activo
                </span>
              </div>
            </div>
          </Card>

          {/* WhatsApp Integration Mode Card */}
          {whatsappEnabled && (
            <Card className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Configuración de Conexión de WhatsApp
                  </h2>
                  <p className="text-xs text-slate-500">
                    Elige si deseas usar la pasarela gestionada de EDUCA o tu propia cuenta de Meta:
                  </p>
                </div>
              </div>

              <SegmentedControl
                value={whatsappMode}
                onChange={setWhatsappMode}
                options={[
                  {
                    value: "managed" as const,
                    label: "Pasarela Oficial EDUCA (Sin configuración)",
                  },
                  {
                    value: "custom" as const,
                    label: "Cuenta Propia de Meta Business",
                  },
                ]}
              />

              {whatsappMode === "managed" ? (
                <div className="rounded-xl border border-brand-200 bg-brand-50/70 p-4 text-xs text-slate-700">
                  <div className="flex items-center gap-2 font-bold text-brand-900">
                    <IconCheck className="h-4 w-4 text-brand-700" />
                    Pasarela Oficial EDUCA Activa
                  </div>
                  <p className="mt-1 text-slate-600">
                    Tu academia no necesita registrarse como desarrollador en Facebook ni configurar tokens técnicos. Los avisos se enviarán automáticamente a través de la infraestructura verificada de EDUCA con plantillas de alta entregabilidad.
                  </p>
                </div>
              ) : (
                <div className="space-y-4 rounded-xl border border-stone-200 bg-stone-50/60 p-4">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                    <span>⚙️ Credenciales de Meta Cloud API</span>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">
                      WhatsApp Phone Number ID
                    </label>
                    <Input
                      placeholder="Ej. 109823485729102"
                      value={phoneNumberId}
                      onChange={(e) => setPhoneNumberId(e.target.value)}
                    />
                    <p className="mt-1 text-[11px] text-slate-400">
                      Encuéntralo en Meta for Developers $\rightarrow$ WhatsApp $\rightarrow$ API Setup.
                    </p>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">
                      Token de Acceso Permanente (System User Token)
                    </label>
                    <Input
                      type="password"
                      placeholder={
                        settings?.whatsapp_token_masked
                          ? `Actual: ${settings.whatsapp_token_masked}`
                          : "EAAG..."
                      }
                      value={whatsappToken}
                      onChange={(e) => setWhatsappToken(e.target.value)}
                    />
                    <p className="mt-1 text-[11px] text-slate-400">
                      Generado en Meta Business Manager con permiso <code className="bg-stone-200 px-1 rounded">whatsapp_business_messaging</code>.
                    </p>
                  </div>
                </div>
              )}

              {/* Default Country Code */}
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  Código de País Predeterminado
                </label>
                <Select
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value)}
                >
                  {COUNTRY_CODES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.label}
                    </option>
                  ))}
                </Select>
                <p className="mt-1 text-[11px] text-slate-400">
                  Se antepone automáticamente a los teléfonos que se registren sin el símbolo "+".
                </p>
              </div>
            </Card>
          )}

          {/* Save Button */}
          <div className="flex justify-end">
            <Button
              onClick={handleSave}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending
                ? "Guardando cambios…"
                : "Guardar Configuración"}
            </Button>
          </div>
        </div>

        {/* Right Column: Triggers & Test Sandbox */}
        <div className="space-y-6 lg:col-span-5">
          {/* Automated Event Triggers */}
          <Card className="space-y-4">
            <h2 className="text-base font-bold text-slate-900">
              Disparadores Automáticos
            </h2>
            <p className="text-xs text-slate-500">
              Selecciona los eventos que enviarán mensajes a alumnos y docentes:
            </p>

            <div className="space-y-2.5">
              <label className="flex items-start gap-3 rounded-lg border border-stone-200 bg-white p-3 cursor-pointer hover:bg-stone-50 transition">
                <input
                  type="checkbox"
                  checked={triggers.class_cancelled}
                  onChange={() => toggleTrigger("class_cancelled")}
                  className="mt-0.5 h-4 w-4 rounded accent-brand-600"
                />
                <div>
                  <div className="text-xs font-semibold text-slate-900">
                    🔴 Clase Cancelada
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Avisa de inmediato a los alumnos cuando una clase no se impartirá.
                  </div>
                </div>
              </label>

              <label className="flex items-start gap-3 rounded-lg border border-stone-200 bg-white p-3 cursor-pointer hover:bg-stone-50 transition">
                <input
                  type="checkbox"
                  checked={triggers.class_rescheduled}
                  onChange={() => toggleTrigger("class_rescheduled")}
                  className="mt-0.5 h-4 w-4 rounded accent-brand-600"
                />
                <div>
                  <div className="text-xs font-semibold text-slate-900">
                    🗓️ Clase Reprogramada
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Envía la nueva fecha y hora exacta establecida por el profesor.
                  </div>
                </div>
              </label>

              <label className="flex items-start gap-3 rounded-lg border border-stone-200 bg-white p-3 cursor-pointer hover:bg-stone-50 transition">
                <input
                  type="checkbox"
                  checked={triggers.at_risk_absences}
                  onChange={() => toggleTrigger("at_risk_absences")}
                  className="mt-0.5 h-4 w-4 rounded accent-brand-600"
                />
                <div>
                  <div className="text-xs font-semibold text-slate-900">
                    ⚠️ Alertas de Inasistencias Consecutivas
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Notifica al alumno o tutor cuando acumula 2 faltas para evitar deserción.
                  </div>
                </div>
              </label>

              <label className="flex items-start gap-3 rounded-lg border border-stone-200 bg-white p-3 cursor-pointer hover:bg-stone-50 transition">
                <input
                  type="checkbox"
                  checked={triggers.assignment_reminder}
                  onChange={() => toggleTrigger("assignment_reminder")}
                  className="mt-0.5 h-4 w-4 rounded accent-brand-600"
                />
                <div>
                  <div className="text-xs font-semibold text-slate-900">
                    📝 Recordatorio de Entrega de Tareas
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Aviso 24 horas antes del vencimiento a los alumnos que no han entregado.
                  </div>
                </div>
              </label>

              <label className="flex items-start gap-3 rounded-lg border border-stone-200 bg-white p-3 cursor-pointer hover:bg-stone-50 transition">
                <input
                  type="checkbox"
                  checked={triggers.payment_reminder}
                  onChange={() => toggleTrigger("payment_reminder")}
                  className="mt-0.5 h-4 w-4 rounded accent-brand-600"
                />
                <div>
                  <div className="text-xs font-semibold text-slate-900">
                    💳 Recordatorio de Cuota / Colegiatura
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Recordatorio cortés a alumnos con mensualidad próxima a vencer.
                  </div>
                </div>
              </label>
            </div>
          </Card>

          {/* Test Sandbox Card */}
          <Card className="space-y-4 border-emerald-200 bg-emerald-50/30">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <span>🧪 Probar Envío por WhatsApp</span>
              </h2>
              <p className="text-xs text-slate-500">
                Envía un mensaje de prueba a tu propio número para validar que la conexión funciona perfectamente:
              </p>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">
                Número de Teléfono de Prueba
              </label>
              <div className="flex gap-2">
                <Input
                  placeholder="Ej. +502 5555 1234"
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                />
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={isTesting}
                  onClick={handleSendTest}
                >
                  {isTesting ? "Enviando…" : "Enviar Prueba"}
                </Button>
              </div>
            </div>

            {testResult && (
              <div
                className={`rounded-lg p-3 text-xs flex items-start gap-2 ${
                  testResult.success
                    ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                    : "bg-red-100 text-red-800 border border-red-200"
                }`}
              >
                {testResult.success ? (
                  <IconCheck className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
                ) : (
                  <IconAlert className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
                )}
                <span>{testResult.message}</span>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
