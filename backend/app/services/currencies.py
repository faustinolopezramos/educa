"""Las monedas en que una academia puede cobrar a sus alumnos.

La elige su director al crear la academia (`Tenant.currency`). Rige cuotas,
pagos, saldos, comprobantes y la nómina de profesores. No tiene nada que ver
con el precio de los planes de EDUCA, que se cobran siempre en quetzales.

Cambiarla después no convierte ningún importe: sólo cambia cómo se muestran.

El frontend tiene la misma lista en `frontend/src/lib/currency.ts`.
"""

from __future__ import annotations

from decimal import Decimal

DEFAULT_CURRENCY = "GTQ"

#: Código ISO 4217 → (nombre, símbolo).
CURRENCIES: dict[str, tuple[str, str]] = {
    "GTQ": ("Quetzal guatemalteco", "Q"),
    "USD": ("Dólar estadounidense", "$"),
    "MXN": ("Peso mexicano", "$"),
    "HNL": ("Lempira hondureño", "L"),
    "NIO": ("Córdoba nicaragüense", "C$"),
    "CRC": ("Colón costarricense", "₡"),
    "PAB": ("Balboa panameño", "B/."),
    "DOP": ("Peso dominicano", "RD$"),
    "COP": ("Peso colombiano", "$"),
    "PEN": ("Sol peruano", "S/"),
    "EUR": ("Euro", "€"),
}


def validate_currency(value: str) -> str:
    """Para los esquemas: el código en mayúsculas, si es una moneda admitida."""
    code = value.strip().upper()
    if code not in CURRENCIES:
        raise ValueError(
            f"Moneda no admitida: {value}. Usa una de: {', '.join(CURRENCIES)}"
        )
    return code


def format_money(amount: Decimal | float | int, currency: str | None) -> str:
    """'Q1,250.00' — un importe con el símbolo de la moneda de la academia."""
    symbol = CURRENCIES.get((currency or "").upper(), ("", currency or ""))[1]
    return f"{symbol}{Decimal(amount):,.2f}"
