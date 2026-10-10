/**
 * Vibración háptica sutil para confirmación física en dispositivos táctiles.
 * Falla silenciosamente si no está soportado en la plataforma o carece de permisos.
 */
export function triggerHaptic(pattern: number | number[] = 25): void {
  try {
    if (
      typeof window !== "undefined" &&
      typeof navigator !== "undefined" &&
      "vibrate" in navigator &&
      typeof navigator.vibrate === "function"
    ) {
      navigator.vibrate(pattern);
    }
  } catch {
    // Silencioso ante restricciones del navegador o falta de permisos
  }
}
