/**
 * Helper utility for form validations, masks, and field formatting.
 */

// Email regex pattern
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Phone formatting and validation (Guatemala / International)
export function formatPhoneNumber(val: string): string {
  const digits = val.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length <= 4) return digits;
  if (digits.length <= 8) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `+${digits.slice(0, digits.length - 8)} ${digits.slice(-8, -4)}-${digits.slice(-4)}`;
}

// DPI / CUI / Pasaporte auto-formatting and validation
export function formatCuiPassport(val: string): string {
  const clean = val.trim();
  // If it's all digits (DPI / CUI), format as 13-digit DPI: XXXX XXXXX XXXX
  const digitsOnly = clean.replace(/\D/g, "");
  if (digitsOnly.length === 13 && clean.replace(/\s+/g, "").length === 13) {
    return `${digitsOnly.slice(0, 4)} ${digitsOnly.slice(4, 9)} ${digitsOnly.slice(9, 13)}`;
  }
  return clean;
}

export function validateCuiPassport(val: string): { isValid: boolean; error?: string } {
  const clean = val.replace(/[^a-zA-Z0-9]/g, "");
  if (!clean) {
    return { isValid: false, error: "La identificación personal (DPI, Pasaporte, DNI) es obligatoria" };
  }
  if (clean.length < 4 || clean.length > 25) {
    return { isValid: false, error: "El documento de identificación debe contener entre 4 y 25 caracteres alfanuméricos" };
  }
  return { isValid: true };
}

export function validateEmailFormat(val: string): { isValid: boolean; error?: string } {
  if (!val.trim()) {
    return { isValid: false, error: "El correo electrónico es obligatorio" };
  }
  if (!EMAIL_REGEX.test(val.trim())) {
    return { isValid: false, error: "Ingresa una dirección de correo electrónico válida (ej. usuario@dominio.com)" };
  }
  return { isValid: true };
}

export function validateFullNameFormat(val: string): { isValid: boolean; error?: string } {
  const clean = val.trim();
  if (!clean) {
    return { isValid: false, error: "El nombre completo es obligatorio" };
  }
  if (clean.length < 3) {
    return { isValid: false, error: "El nombre debe tener al menos 3 caracteres" };
  }
  return { isValid: true };
}
