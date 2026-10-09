/**
 * Las monedas en que una academia puede cobrar a sus alumnos.
 *
 * La elige su director al crear la academia y rige cómo se muestran cuotas,
 * pagos, saldos, comprobantes y la nómina. Es la misma lista que
 * `backend/app/services/currencies.py`, que es quien la valida.
 *
 * Nada que ver con los precios de los planes de EDUCA (`lib/plans.ts`), que se
 * cobran siempre en quetzales.
 */
export const DEFAULT_CURRENCY = "GTQ";

export const CURRENCIES: { code: string; name: string; symbol: string }[] = [
  { code: "GTQ", name: "Quetzal guatemalteco", symbol: "Q" },
  { code: "USD", name: "Dólar estadounidense", symbol: "$" },
  { code: "MXN", name: "Peso mexicano", symbol: "$" },
  { code: "HNL", name: "Lempira hondureño", symbol: "L" },
  { code: "NIO", name: "Córdoba nicaragüense", symbol: "C$" },
  { code: "CRC", name: "Colón costarricense", symbol: "₡" },
  { code: "PAB", name: "Balboa panameño", symbol: "B/." },
  { code: "DOP", name: "Peso dominicano", symbol: "RD$" },
  { code: "COP", name: "Peso colombiano", symbol: "$" },
  { code: "PEN", name: "Sol peruano", symbol: "S/" },
  { code: "EUR", name: "Euro", symbol: "€" },
];

export function currencySymbol(code: string | null | undefined): string {
  const upper = (code ?? DEFAULT_CURRENCY).toUpperCase();
  return CURRENCIES.find((c) => c.code === upper)?.symbol ?? upper;
}

/** "Q1,250.00" · "-$40.00" — un importe en la moneda indicada. */
export function formatMoney(amount: number, code: string | null | undefined): string {
  const digits = Math.abs(amount).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${amount < 0 ? "-" : ""}${currencySymbol(code)}${digits}`;
}
