"""Bloqueo progresivo de cuentas e IPs tras intentos fallidos.

Cada fallo se anota en el limitador de intentos (memoria o Redis, según
`REDIS_URL`) y, al cruzar un umbral, se fija un plazo de bloqueo que crece con
la reincidencia. Hasta ahora `_get_recent_attempts` devolvía siempre `[]` y
`_get_lockout_until` siempre `None`: el servicio existía, se llamaba en cada
login y no bloqueaba a nadie.

Tres contadores independientes, cada uno con su escala:

* **usuario** — contraseñas falladas contra una cuenta concreta.
* **MFA** — códigos de segundo factor fallados contra una cuenta. Va aparte
  para que adivinar el código no gaste el presupuesto de la contraseña ni al
  revés, y porque un código de 6 dígitos se adivina por fuerza bruta mucho
  antes que una contraseña.
* **IP** — fallos de cualquier cuenta desde una misma dirección. Su escala es
  mucho más holgada: una clase entera sale por una sola IP (NAT) y unos cuantos
  errores de tecleo no deben dejar a todos fuera.
"""

from __future__ import annotations

import hashlib
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional

from app.core.rate_limiter import RateLimiter, get_rate_limiter

logger = logging.getLogger(__name__)

# (fallos acumulados, segundos de bloqueo). Se aplica el último umbral cruzado.
USER_THRESHOLDS: list[tuple[int, int]] = [
    (5, 15 * 60),
    (10, 60 * 60),
    (20, 24 * 60 * 60),
]
IP_THRESHOLDS: list[tuple[int, int]] = [
    (30, 15 * 60),
    (60, 60 * 60),
    (120, 24 * 60 * 60),
]
# Compatibilidad con quien importaba el nombre anterior.
LOCKOUT_THRESHOLDS = USER_THRESHOLDS

# Ventana en la que se cuentan los fallos (24 horas).
ATTEMPT_WINDOW_SECONDS = 24 * 60 * 60

IP_PREFIX = "lockout:ip:"
USER_PREFIX = "lockout:user:"
MFA_PREFIX = "lockout:mfa:"
# Correos que no pertenecen a ninguna cuenta. Sin esto, tras unos intentos fallidos una
# cuenta real respondía «bloqueada» y un correo inventado seguía respondiendo
# «contraseña incorrecta»: la diferencia delataba qué correos existen.
EMAIL_PREFIX = "lockout:email:"

_THRESHOLDS_BY_PREFIX = {
    IP_PREFIX: IP_THRESHOLDS,
    USER_PREFIX: USER_THRESHOLDS,
    MFA_PREFIX: USER_THRESHOLDS,
    EMAIL_PREFIX: USER_THRESHOLDS,
}


@dataclass(frozen=True)
class LockoutStatus:
    """Estado actual de bloqueo para un usuario/IP."""

    is_locked: bool
    attempts: int
    lockout_until: Optional[datetime]
    next_threshold: int
    next_lockout_seconds: int


class AccountLockoutService:
    """Cuenta fallos y mantiene el plazo de bloqueo de cada identificador."""

    def __init__(self, rate_limiter: Optional[RateLimiter] = None):
        self._rate_limiter = rate_limiter

    @property
    def rate_limiter(self) -> RateLimiter:
        # Se consulta en cada uso, no al construir: el limitador global se fija
        # al arrancar la app y las pruebas lo cambian.
        return self._rate_limiter or get_rate_limiter()

    @staticmethod
    def _thresholds(prefix: str) -> list[tuple[int, int]]:
        return _THRESHOLDS_BY_PREFIX.get(prefix, USER_THRESHOLDS)

    def _lockout_duration(self, attempts: int, prefix: str) -> int:
        for threshold, duration in reversed(self._thresholds(prefix)):
            if attempts >= threshold:
                return duration
        return 0

    def _next_threshold(self, attempts: int, prefix: str) -> tuple[int, int]:
        thresholds = self._thresholds(prefix)
        for threshold, duration in thresholds:
            if attempts < threshold:
                return threshold, duration
        return thresholds[-1]

    @staticmethod
    def _keys(identifier: str, prefix: str) -> tuple[str, str]:
        base = f"{prefix}{identifier}"
        return f"{base}:attempts", f"{base}:lockout"

    def check_lockout(self, identifier: str, prefix: str) -> LockoutStatus:
        """Si el identificador está bloqueado ahora mismo."""
        attempts_key, lockout_key = self._keys(identifier, prefix)
        attempts = self.rate_limiter.count_recent(attempts_key, ATTEMPT_WINDOW_SECONDS)
        until = self.rate_limiter.get_deadline(lockout_key)
        next_threshold, next_seconds = self._next_threshold(attempts, prefix)
        return LockoutStatus(
            is_locked=until is not None,
            attempts=attempts,
            lockout_until=until,
            next_threshold=next_threshold,
            next_lockout_seconds=next_seconds,
        )

    def record_failed_attempt(self, identifier: str, prefix: str) -> LockoutStatus:
        """Anota un fallo y, si cruza un umbral, bloquea."""
        attempts_key, lockout_key = self._keys(identifier, prefix)
        self.rate_limiter.record_failed_attempt(attempts_key, ATTEMPT_WINDOW_SECONDS)
        attempts = self.rate_limiter.count_recent(attempts_key, ATTEMPT_WINDOW_SECONDS)

        seconds = self._lockout_duration(attempts, prefix)
        if seconds:
            until = datetime.now(timezone.utc) + timedelta(seconds=seconds)
            self.rate_limiter.set_deadline(lockout_key, until)
            logger.warning(
                "Lockout %s%s: %d failures, locked for %d seconds",
                prefix, identifier, attempts, seconds,
            )
        return self.check_lockout(identifier, prefix)

    def clear_lockout(self, identifier: str, prefix: str) -> None:
        """Olvida fallos y bloqueo (p. ej. tras un acceso correcto)."""
        attempts_key, lockout_key = self._keys(identifier, prefix)
        self.rate_limiter.clear(attempts_key)
        self.rate_limiter.clear(lockout_key)


_lockout_service: Optional[AccountLockoutService] = None


def get_lockout_service() -> AccountLockoutService:
    global _lockout_service
    if _lockout_service is None:
        _lockout_service = AccountLockoutService()
    return _lockout_service


def check_ip_lockout(ip: str) -> LockoutStatus:
    return get_lockout_service().check_lockout(ip, IP_PREFIX)


def check_user_lockout(user_id: int) -> LockoutStatus:
    return get_lockout_service().check_lockout(str(user_id), USER_PREFIX)


def _email_identifier(email: str) -> str:
    """El correo no se guarda en claro en las claves del limitador (ni en Redis)."""
    return hashlib.sha256(email.strip().lower().encode("utf-8")).hexdigest()[:32]


def check_email_lockout(email: str) -> LockoutStatus:
    return get_lockout_service().check_lockout(_email_identifier(email), EMAIL_PREFIX)


def check_mfa_lockout(user_id: int) -> LockoutStatus:
    return get_lockout_service().check_lockout(str(user_id), MFA_PREFIX)


def record_failed_login(
    ip: str, user_id: Optional[int] = None, unknown_email: Optional[str] = None
) -> tuple[LockoutStatus, Optional[LockoutStatus]]:
    """Anota un login fallido contra la IP y, si se conoce, contra la cuenta.

    Con `unknown_email` (un correo sin cuenta) el fallo se anota contra él, para
    que se bloquee igual que uno real y el bloqueo no sirva de oráculo.
    """
    ip_status = get_lockout_service().record_failed_attempt(ip, IP_PREFIX)
    user_status = None
    if user_id is not None:
        user_status = get_lockout_service().record_failed_attempt(str(user_id), USER_PREFIX)
    elif unknown_email:
        user_status = get_lockout_service().record_failed_attempt(
            _email_identifier(unknown_email), EMAIL_PREFIX
        )
    return ip_status, user_status


def record_failed_mfa(user_id: int) -> LockoutStatus:
    return get_lockout_service().record_failed_attempt(str(user_id), MFA_PREFIX)


def clear_lockouts(ip: str, user_id: Optional[int] = None) -> None:
    """Tras un login correcto, olvida los fallos de *la cuenta*.

    La IP no se limpia: quien acierta una contraseña no ha demostrado que las
    fallidas anteriores desde esa dirección fueran suyas. Si se limpiara, un
    atacante con una cuenta propia reiniciaría su contador entre ráfagas.
    """
    if user_id is not None:
        get_lockout_service().clear_lockout(str(user_id), USER_PREFIX)


def clear_mfa_lockout(user_id: int) -> None:
    get_lockout_service().clear_lockout(str(user_id), MFA_PREFIX)
