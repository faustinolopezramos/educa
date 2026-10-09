import { useAuth } from "../auth/AuthContext";
import { DEFAULT_CURRENCY, currencySymbol, formatMoney } from "./currency";

/**
 * El formateador de la academia del usuario que está dentro.
 *
 * `money(1250)` → "Q1,250.00"; `symbol` sirve para las etiquetas de los campos
 * ("Monto (Q)").
 */
export function useMoney() {
  const { user } = useAuth();
  const code = user?.tenant_currency ?? DEFAULT_CURRENCY;
  return {
    currency: code,
    symbol: currencySymbol(code),
    money: (amount: number) => formatMoney(amount, code),
  };
}
