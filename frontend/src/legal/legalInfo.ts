/**
 * Los datos del responsable de EDUCA que aparecen en los documentos legales.
 *
 * Los valores entre corchetes son marcadores: hay que sustituirlos por los
 * reales antes de publicar (ver `hasPlaceholders`). Los textos, además, deben
 * revisarlos un abogado: son una base redactada a partir de lo que hace el
 * sistema, no asesoría legal.
 */
export const LEGAL = {
  /** Nombre comercial del servicio. */
  product: "EDUCA",
  /** Razón social o nombre de la persona individual que opera EDUCA. */
  owner: "[RAZÓN SOCIAL O NOMBRE DEL TITULAR]",
  /** Número de Identificación Tributaria del titular. */
  taxId: "[NIT]",
  address: "[DIRECCIÓN COMPLETA], Guatemala",
  country: "Guatemala",
  /** Ciudad cuyos tribunales resuelven las controversias. */
  jurisdictionCity: "[CIUDAD], Guatemala",
  privacyEmail: "[CORREO DE PRIVACIDAD]",
  supportEmail: "[CORREO DE SOPORTE]",
  website: "[DOMINIO DEL SITIO]",
  /** Días para responder a una solicitud de derechos sobre los datos. */
  rightsResponseDays: 30,
  /** Días que se conservan los datos de una academia tras darse de baja. */
  retentionAfterCancelDays: 90,
  /** Días de aviso antes de un cambio de precio o de los términos. */
  noticeDays: 30,
  /**
   * Versión vigente de los Términos y la Política de Privacidad. Tiene que
   * coincidir con `backend/app/services/legal.py`, que es la que se registra al
   * aceptar.
   */
  version: "2026-10-07",
  /** Fecha de la versión, como se muestra. */
  effectiveDate: "7 de octubre de 2026",
} as const;

/** Si queda algún marcador sin rellenar (para avisar antes de publicar). */
export function hasPlaceholders(): boolean {
  return Object.values(LEGAL).some((v) => typeof v === "string" && /\[[^\]]+\]/.test(v));
}
