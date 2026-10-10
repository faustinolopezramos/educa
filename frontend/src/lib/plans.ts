/**
 * Los planes de EDUCA y sus precios mensuales en quetzales.
 *
 * La fuente de verdad es el backend (`backend/app/services/plans.py`, servido en
 * `GET /academy/plans`); esto es su copia para las páginas públicas (portada y
 * registro), que no deben esperar a la API para pintar los precios. Si cambia
 * un precio o un cupo, cambia en los dos sitios.
 */
export type PlanCode = "free" | "starter" | "pro" | "scale";

export interface PlanInfo {
  code: PlanCode;
  name: string;
  maxStudents: number;
  monthlyPrice: number;
}

export const PLAN_CATALOG: Record<PlanCode, PlanInfo> = {
  free: { code: "free", name: "Gratis", maxStudents: 15, monthlyPrice: 0 },
  starter: { code: "starter", name: "Starter", maxStudents: 100, monthlyPrice: 199 },
  pro: { code: "pro", name: "Profesional", maxStudents: 300, monthlyPrice: 499 },
  scale: { code: "scale", name: "Escala", maxStudents: 1000, monthlyPrice: 999 },
};

/** "Q999" — el precio como se muestra en toda la aplicación. */
export function formatQuetzales(amount: number): string {
  return `Q${amount.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}
