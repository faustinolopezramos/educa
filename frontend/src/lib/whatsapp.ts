/**
 * Utilities for WhatsApp contact and templates.
 */

export function cleanPhoneForWhatsApp(phone: string | null | undefined): string {
  if (!phone) return "";
  // Strip all non-digit characters except leading plus
  let cleaned = phone.replace(/[^\d+]/g, "");
  if (cleaned.startsWith("+")) {
    cleaned = cleaned.slice(1);
  }
  // Standard Guatemala number is 8 digits; prefix country code 502 if 8 digits
  if (cleaned.length === 8) {
    cleaned = `502${cleaned}`;
  }
  return cleaned;
}

export function buildWhatsAppUrl(phone: string | null | undefined, text?: string): string {
  const cleaned = cleanPhoneForWhatsApp(phone);
  if (!cleaned) return "";
  const query = text ? `?text=${encodeURIComponent(text)}` : "";
  return `https://wa.me/${cleaned}${query}`;
}

export interface WhatsAppTemplate {
  id: string;
  title: string;
  description: string;
  buildText: (ctx: {
    studentName: string;
    courseName?: string;
    balance?: number;
    currency?: string;
    academyName?: string;
  }) => string;
}

export const WHATSAPP_TEMPLATES: WhatsAppTemplate[] = [
  {
    id: "payment_reminder",
    title: "Recordatorio de Pago / Cuota",
    description: "Aviso amable sobre saldo pendiente y boleta de pago.",
    buildText: ({ studentName, courseName, balance, currency = "Q", academyName = "la academia" }) => {
      const balanceStr = balance && balance > 0 ? ` de ${currency} ${balance.toFixed(2)}` : "";
      const courseStr = courseName ? ` en tu curso ${courseName}` : "";
      return `Hola ${studentName}, te saludamos de ${academyName}. Te recordamos amablemente que tienes un saldo pendiente${balanceStr}${courseStr}. Si ya realizaste tu pago, por favor compártenos tu boleta o comprobante por este medio. ¡Muchas gracias!`;
    },
  },
  {
    id: "welcome",
    title: "Bienvenida y Datos de Clase",
    description: "Saludo de bienvenida para nuevos alumnos.",
    buildText: ({ studentName, courseName, academyName = "la academia" }) => {
      const courseStr = courseName ? ` al curso ${courseName}` : " a tus clases";
      return `Hola ${studentName}, ¡te damos una cordial bienvenida a ${academyName}! Estamos muy contentos de acompañarte en tu aprendizaje${courseStr}. Si tienes alguna duda con tus horarios o el acceso al aula virtual, estamos a tu disposición.`;
    },
  },
  {
    id: "support",
    title: "Atención General / Consulta",
    description: "Mensaje abierto de atención desde secretaría.",
    buildText: ({ studentName, academyName = "la academia" }) => {
      return `Hola ${studentName}, te saludamos del equipo de atención y secretaría de ${academyName}. Nos comunicamos contigo para darte seguimiento. ¿En qué te podemos apoyar el día de hoy?`;
    },
  },
];
