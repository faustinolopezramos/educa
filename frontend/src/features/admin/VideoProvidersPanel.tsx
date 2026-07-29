import { useState } from "react";
import { Badge, Button, Card, Input } from "../../components/ui";
import { api, apiErrorMessage } from "../../lib/api";
import { notify } from "../../lib/toast";
import type { ProviderName } from "../../lib/types";

export function VideoProvidersPanel() {
  const [provider, setProvider] = useState<ProviderName>("manual");
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  // Zoom Credentials
  const [zoomAccountId, setZoomAccountId] = useState("");
  const [zoomClientId, setZoomClientId] = useState("");
  const [zoomClientSecret, setZoomClientSecret] = useState("");

  // Google Credentials
  const [googleAccessToken, setGoogleAccessToken] = useState("");
  const [googleCalendarId, setGoogleCalendarId] = useState("primary");

  async function handleTestConnection() {
    setTesting(true);
    try {
      const credentials =
        provider === "zoom"
          ? { account_id: zoomAccountId, client_id: zoomClientId, client_secret: zoomClientSecret }
          : provider === "google"
          ? { access_token: googleAccessToken, calendar_id: googleCalendarId }
          : {};

      const res = await api.post("/meetings/providers/test", {
        name: provider,
        is_active: true,
        credentials,
      });

      notify(res.data.message || "Conexión probada con éxito", "success");
    } catch (err) {
      notify(apiErrorMessage(err, "Error al probar conexión con el proveedor"), "error");
    } finally {
      setTesting(false);
    }
  }

  async function handleSaveProvider() {
    setSaving(true);
    try {
      const credentials =
        provider === "zoom"
          ? { account_id: zoomAccountId, client_id: zoomClientId, client_secret: zoomClientSecret }
          : provider === "google"
          ? { access_token: googleAccessToken, calendar_id: googleCalendarId }
          : undefined;

      await api.put("/meetings/providers", {
        name: provider,
        is_active: true,
        credentials,
      });

      notify(`Proveedor ${provider.toUpperCase()} guardado y activado`, "success");
    } catch (err) {
      notify(apiErrorMessage(err, "Error al guardar la configuración del proveedor"), "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="font-medium text-slate-900">Proveedor de Videoconferencia</h3>
          <p className="text-xs text-slate-500">
            Selecciona la integración de video para las clases virtuales de tu academia.
          </p>
        </div>
        <Badge color={provider === "manual" ? "slate" : "green"}>
          {provider === "manual" ? "Modo Manual (Default)" : `Nativo: ${provider.toUpperCase()}`}
        </Badge>
      </div>

      <div className="mb-6 flex gap-2">
        <Button
          variant={provider === "manual" ? "primary" : "secondary"}
          onClick={() => setProvider("manual")}
        >
          Manual (URL Pegada)
        </Button>
        <Button
          variant={provider === "zoom" ? "primary" : "secondary"}
          onClick={() => setProvider("zoom")}
        >
          Zoom (S2S OAuth)
        </Button>
        <Button
          variant={provider === "google" ? "primary" : "secondary"}
          onClick={() => setProvider("google")}
        >
          Google Meet API
        </Button>
      </div>

      {provider === "manual" && (
        <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
          <p className="font-medium text-slate-800">Modo Manual Activado</p>
          <p className="mt-1 text-xs">
            Los profesores ingresarán manualmente el enlace de Zoom, Meet o Teams al proponer la ubicación de su clase.
            No se requieren credenciales API ni configuraciones externas.
          </p>
        </div>
      )}

      {provider === "zoom" && (
        <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <h4 className="text-sm font-medium text-slate-800">Configuración Zoom Server-to-Server OAuth</h4>
          <div>
            <label className="text-xs font-medium text-slate-600">Account ID</label>
            <Input
              value={zoomAccountId}
              onChange={(e) => setZoomAccountId(e.target.value)}
              placeholder="Ej. abc123def456"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Client ID</label>
            <Input
              value={zoomClientId}
              onChange={(e) => setZoomClientId(e.target.value)}
              placeholder="Ej. client_id_zoom_123"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Client Secret</label>
            <Input
              type="password"
              value={zoomClientSecret}
              onChange={(e) => setZoomClientSecret(e.target.value)}
              placeholder="••••••••••••••••"
            />
          </div>
        </div>
      )}

      {provider === "google" && (
        <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <h4 className="text-sm font-medium text-slate-800">Configuración Google Calendar / Meet API</h4>
          <div>
            <label className="text-xs font-medium text-slate-600">OAuth Access Token / Service Account Key</label>
            <Input
              type="password"
              value={googleAccessToken}
              onChange={(e) => setGoogleAccessToken(e.target.value)}
              placeholder="ya29.a0AfH6SM..."
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">ID del Calendario (Default: primary)</label>
            <Input
              value={googleCalendarId}
              onChange={(e) => setGoogleCalendarId(e.target.value)}
              placeholder="primary"
            />
          </div>
        </div>
      )}

      {provider !== "manual" && (
        <div className="mt-4 flex gap-2">
          <Button variant="secondary" onClick={handleTestConnection} disabled={testing}>
            {testing ? "Probando..." : "Probar Conexión"}
          </Button>
          <Button variant="primary" onClick={handleSaveProvider} disabled={saving}>
            {saving ? "Guardando..." : "Guardar y Activar"}
          </Button>
        </div>
      )}
    </Card>
  );
}
