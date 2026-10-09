"""Servicio para verificar contraseñas contra HaveIBeenPwned (API k-anonymity)."""

from __future__ import annotations

import hashlib
import logging
import os
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

# URL de la API de HaveIBeenPwned (k-anonymity)
HIBP_API_URL = "https://api.pwnedpasswords.com/range/"

# Timeout para la petición
REQUEST_TIMEOUT = 5.0

# Umbral: si la contraseña aparece más de X veces en breaches, se considera comprometida
BREACH_THRESHOLD = 1


class BreachCheckResult:
    """Resultado de la verificación de breach."""

    def __init__(
        self,
        compromised: bool,
        count: int = 0,
        error: Optional[str] = None,
    ):
        self.compromised = compromised
        self.count = count
        self.error = error

    @property
    def is_safe(self) -> bool:
        return not self.compromised and self.error is None


async def check_password_breach(password: str) -> BreachCheckResult:
    """
    Verifica si una contraseña ha sido comprometida usando la API k-anonymity de HIBP.

    La API usa k-anonymity: enviamos los primeros 5 caracteres del SHA-1 hash,
    y recibimos una lista de sufijos con sus conteos. Nunca enviamos la contraseña
    completa ni el hash completo.
    """
    if not password or len(password) < 8:
        return BreachCheckResult(
            compromised=False,
            error="La contraseña es demasiado corta para verificar",
        )

    # Calcular SHA-1 hash
    sha1_hash = hashlib.sha1(password.encode("utf-8")).hexdigest().upper()
    prefix = sha1_hash[:5]
    suffix = sha1_hash[5:]

    try:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
            # Añadir header para identificación (buenas prácticas)
            headers = {
                "User-Agent": "EDUCA-Security-Check/1.0",
                "Add-Padding": "true",  # Añade padding para evitar análisis de tráfico
            }
            response = await client.get(f"{HIBP_API_URL}{prefix}", headers=headers)

        if response.status_code != 200:
            logger.warning("HIBP API returned status %d", response.status_code)
            return BreachCheckResult(
                compromised=False,
                error=f"Error al verificar (HTTP {response.status_code})",
            )

        # Parsear respuesta: cada línea es "SUFIX:COUNT"
        for line in response.text.splitlines():
            if ":" in line:
                line_suffix, count_str = line.strip().split(":", 1)
                if line_suffix == suffix:
                    count = int(count_str)
                    return BreachCheckResult(
                        compromised=count >= BREACH_THRESHOLD,
                        count=count,
                    )

        # Sufijo no encontrado = no comprometida
        return BreachCheckResult(compromised=False, count=0)

    except httpx.TimeoutException:
        logger.warning("HIBP API timeout")
        return BreachCheckResult(
            compromised=False,
            error="Tiempo de espera agotado al verificar contraseña",
        )
    except httpx.RequestError as e:
        logger.warning("HIBP API request error: %s", e)
        return BreachCheckResult(
            compromised=False,
            error=f"Error de red al verificar: {e}",
        )
    except Exception as e:
        logger.exception("Unexpected error checking password breach")
        return BreachCheckResult(
            compromised=False,
            error=f"Error inesperado: {e}",
        )


def check_password_breach_sync(password: str) -> BreachCheckResult:
    """Versión síncrona para contextos no async."""
    if not password or len(password) < 8:
        return BreachCheckResult(
            compromised=False,
            error="La contraseña es demasiado corta para verificar",
        )

    sha1_hash = hashlib.sha1(password.encode("utf-8")).hexdigest().upper()
    prefix = sha1_hash[:5]
    suffix = sha1_hash[5:]

    try:
        headers = {
            "User-Agent": "EDUCA-Security-Check/1.0",
            "Add-Padding": "true",
        }
        response = httpx.get(f"{HIBP_API_URL}{prefix}", headers=headers, timeout=REQUEST_TIMEOUT)

        if response.status_code != 200:
            logger.warning("HIBP API returned status %d", response.status_code)
            return BreachCheckResult(
                compromised=False,
                error=f"Error al verificar (HTTP {response.status_code})",
            )

        for line in response.text.splitlines():
            if ":" in line:
                line_suffix, count_str = line.strip().split(":", 1)
                if line_suffix == suffix:
                    count = int(count_str)
                    return BreachCheckResult(
                        compromised=count >= BREACH_THRESHOLD,
                        count=count,
                    )

        return BreachCheckResult(compromised=False, count=0)

    except httpx.TimeoutException:
        logger.warning("HIBP API timeout")
        return BreachCheckResult(
            compromised=False,
            error="Tiempo de espera agotado al verificar contraseña",
        )
    except httpx.RequestError as e:
        logger.warning("HIBP API request error: %s", e)
        return BreachCheckResult(
            compromised=False,
            error=f"Error de red al verificar: {e}",
        )
    except Exception as e:
        logger.exception("Unexpected error checking password breach")
        return BreachCheckResult(
            compromised=False,
            error=f"Error inesperado: {e}",
        )


def is_password_pwned(password: str) -> tuple[bool, int]:
    """
    Función simple que devuelve (comprometida, count).
    Útil para validaciones rápidas en formularios.
    """
    result = check_password_breach_sync(password)
    return result.compromised, result.count