import { useState } from "react";
import {
  Badge, Button, Card, Field, InlineAlert, Input, PageHeader, SegmentedControl,
} from "../../components/ui";
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
    <div>
      <PageHeader
        title="Videoconferencias"
        description="Cómo se generan los enlaces de las clases virtuales."
        actions={
          <Badge color={provider === "manual" ? "slate" : "green"} dot>
            {provider === "manual" ? "Modo manual" : provider.toUpperCase()}
          </Badge>
        }
      />

      <Card className="max-w-2xl space-y-5">
        <SegmentedControl
          value={provider}
          onChange={setProvider}
          options={[
            { value: "manual" as const, label: "Manual" },
            { value: "zoom" as const, label: "Zoom" },
            { value: "google" as const, label: "Google Meet" },
          ]}
        />

        {provider === "manual" && (
          <InlineAlert type="info" title="No hay nada que configurar">
            Cada profesor pega el enlace de Zoom, Meet o Teams al proponer la ubicación de su
            clase. No hacen falta credenciales.
          </InlineAlert>
        )}

        {provider === "zoom" && (
          <div className="space-y-4">
            <Field label="Account ID">
              <Input
                value={zoomAccountId}
                onChange={(e) => setZoomAccountId(e.target.value)}
                placeholder="Ej. abc123def456"
              />
            </Field>
            <Field label="Client ID">
              <Input
                value={zoomClientId}
                onChange={(e) => setZoomClientId(e.target.value)}
                placeholder="Ej. client_id_zoom_123"
              />
            </Field>
            <Field label="Client Secret">
              <Input
                type="password"
                value={zoomClientSecret}
                onChange={(e) => setZoomClientSecret(e.target.value)}
                placeholder="••••••••••••••••"
              />
            </Field>
          </div>
        )}

        {provider === "google" && (
          <div className="space-y-4">
            <Field label="Access token o clave de cuenta de servicio">
              <Input
                type="password"
                value={googleAccessToken}
                onChange={(e) => setGoogleAccessToken(e.target.value)}
                placeholder="ya29.a0AfH6SM…"
              />
            </Field>
            <Field label="ID del calendario" hint="Por defecto, «primary».">
              <Input
                value={googleCalendarId}
                onChange={(e) => setGoogleCalendarId(e.target.value)}
                placeholder="primary"
              />
            </Field>
          </div>
        )}

        {provider !== "manual" && (
          <div className="flex gap-2 border-t border-slate-100 pt-4">
            <Button variant="secondary" onClick={handleTestConnection} disabled={testing}>
              {testing ? "Probando…" : "Probar conexión"}
            </Button>
            <Button onClick={handleSaveProvider} disabled={saving}>
              {saving ? "Guardando…" : "Guardar y activar"}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
