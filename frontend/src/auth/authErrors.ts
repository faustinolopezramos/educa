/** Una academia entre las que comparten el mismo correo. */
export interface TenantOption {
  id: number;
  slug: string;
  name: string;
}

/** Las academias entre las que elegir, si la API pidió elegir una (409). */
export function tenantChoices(err: unknown): TenantOption[] | null {
  const res = (err as { response?: { status?: number; data?: { detail?: unknown } } })?.response;
  const detail = res?.data?.detail as { code?: string; tenants?: TenantOption[] } | undefined;
  if (res?.status === 409 && detail?.code === "tenant_required") return detail.tenants ?? [];
  return null;
}

/**
 * El motivo de un acceso rechazado, en palabras de quien lo intenta.
 *
 * Un 403 con `code` trae su propio mensaje (sin cuenta, correo sin confirmar,
 * academia suspendida); un 401 es una credencial que no vale.
 */
export function authErrorMessage(err: unknown): string {
  const res = (err as { response?: { status?: number; data?: { detail?: unknown } } })?.response;
  const detail = res?.data?.detail;
  if (res?.status === 403) {
    if (typeof detail === "string") return detail;
    if (detail && typeof detail === "object" && "message" in detail) {
      return String((detail as { message: unknown }).message);
    }
  }
  if (res?.status === 401) return "Correo o contraseña incorrectos.";
  if (res?.status === 429) {
    if (detail && typeof detail === "object" && "message" in detail) {
      return String((detail as { message: unknown }).message);
    }
    return "Demasiados intentos. Espera un minuto.";
  }
  return "No se pudo iniciar sesión. Inténtalo de nuevo.";
}
