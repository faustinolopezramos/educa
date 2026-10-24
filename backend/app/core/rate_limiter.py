"""Rate limiter implementations: In-memory sliding window and Redis.

In development and single-worker setups, MemoryRateLimiter is used by default.
In production with multiple workers, RedisRateLimiter can be used by setting REDIS_URL.
"""

from __future__ import annotations

import logging
import uuid
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Protocol

logger = logging.getLogger(__name__)


class RateLimiter(Protocol):
    def is_rate_limited(self, bucket_key: str, limit: int, window_seconds: int) -> bool:
        ...

    def record_failed_attempt(self, bucket_key: str, window_seconds: int) -> None:
        ...

    def count_recent(self, bucket_key: str, window_seconds: int) -> int:
        ...

    def set_deadline(self, key: str, until: datetime) -> None:
        ...

    def get_deadline(self, key: str) -> datetime | None:
        ...

    def clear(self, key: str) -> None:
        ...


class MemoryRateLimiter:
    """Sliding-window rate limiter in process memory with opportunistic pruning."""

    def __init__(self, storage: dict[str, list[datetime]] | None = None) -> None:
        self.attempts: dict[str, list[datetime]] = storage if storage is not None else defaultdict(list)
        # Plazos de bloqueo (clave -> hasta cuándo). Los usa `account_lockout`.
        self.deadlines: dict[str, datetime] = {}

    def count_recent(self, bucket_key: str, window_seconds: int) -> int:
        window_start = datetime.now(timezone.utc) - timedelta(seconds=window_seconds)
        return sum(1 for t in self.attempts.get(bucket_key, []) if t > window_start)

    def set_deadline(self, key: str, until: datetime) -> None:
        self.deadlines[key] = until

    def get_deadline(self, key: str) -> datetime | None:
        until = self.deadlines.get(key)
        if until is not None and until <= datetime.now(timezone.utc):
            del self.deadlines[key]
            return None
        return until

    def clear(self, key: str) -> None:
        self.attempts.pop(key, None)
        self.deadlines.pop(key, None)

    def reset(self) -> None:
        """Vacía todo. Sólo para las pruebas, que comparten el proceso."""
        self.attempts.clear()
        self.deadlines.clear()

    def is_rate_limited(self, bucket_key: str, limit: int, window_seconds: int) -> bool:
        now = datetime.now(timezone.utc)
        window_start = now - timedelta(seconds=window_seconds)
        recent = [t for t in self.attempts.get(bucket_key, []) if t > window_start]
        if recent:
            self.attempts[bucket_key] = recent
        else:
            self.attempts.pop(bucket_key, None)
        return len(recent) >= limit

    # Por encima de esta cantidad de claves se barren las caducadas al anotar.
    # Sin barrido, cada dirección que fallaba una vez dejaba su clave para
    # siempre: el diccionario sólo se limpiaba al volver a consultar esa misma
    # clave, y un escaneo desde muchas direcciones lo hacía crecer sin límite.
    PRUNE_ABOVE = 10_000

    def record_failed_attempt(self, bucket_key: str, window_seconds: int) -> None:
        now = datetime.now(timezone.utc)
        if len(self.attempts) > self.PRUNE_ABOVE:
            self._prune(now - timedelta(seconds=window_seconds))
        if bucket_key not in self.attempts:
            self.attempts[bucket_key] = []
        self.attempts[bucket_key].append(now)

    def _prune(self, window_start: datetime) -> None:
        stale = [
            key
            for key, stamps in self.attempts.items()
            if not stamps or stamps[-1] <= window_start
        ]
        for key in stale:
            del self.attempts[key]


class RedisRateLimiter:
    """Distributed sliding-window rate limiter using Redis sorted sets."""

    def __init__(self, redis_url: str) -> None:
        import redis  # type: ignore[import-untyped]

        self.client = redis.from_url(redis_url, decode_responses=True)
        # Si Redis no responde, los límites y bloqueos siguen contando en la
        # memoria del proceso. Antes devolvían «sin límite» y «0 intentos», así
        # que una caída de Redis (o provocarla) apagaba la protección del login.
        self._fallback = MemoryRateLimiter()

    def is_rate_limited(self, bucket_key: str, limit: int, window_seconds: int) -> bool:
        try:
            now_ts = datetime.now(timezone.utc).timestamp()
            window_start = now_ts - window_seconds
            key = f"rate_limit:{bucket_key}"
            pipe = self.client.pipeline()
            pipe.zremrangebyscore(key, 0, window_start)
            pipe.zcard(key)
            _, count = pipe.execute()
            return count >= limit
        except Exception as e:
            logger.warning("Redis rate limiter check failed, using local memory: %s", e)
            return self._fallback.is_rate_limited(bucket_key, limit, window_seconds)

    def record_failed_attempt(self, bucket_key: str, window_seconds: int) -> None:
        try:
            now_ts = datetime.now(timezone.utc).timestamp()
            key = f"rate_limit:{bucket_key}"
            pipe = self.client.pipeline()
            # El sufijo evita que dos intentos en el mismo instante colapsen en
            # un solo miembro del conjunto y cuenten como uno.
            pipe.zadd(key, {f"{now_ts}:{uuid.uuid4().hex[:8]}": now_ts})
            pipe.expire(key, window_seconds + 5)
            pipe.execute()
        except Exception as e:
            logger.warning("Redis rate limiter record failed, using local memory: %s", e)
            self._fallback.record_failed_attempt(bucket_key, window_seconds)

    def count_recent(self, bucket_key: str, window_seconds: int) -> int:
        try:
            key = f"rate_limit:{bucket_key}"
            pipe = self.client.pipeline()
            pipe.zremrangebyscore(key, 0, datetime.now(timezone.utc).timestamp() - window_seconds)
            pipe.zcard(key)
            return int(pipe.execute()[1])
        except Exception as e:
            logger.warning("Redis rate limiter count failed, using local memory: %s", e)
            return self._fallback.count_recent(bucket_key, window_seconds)

    def set_deadline(self, key: str, until: datetime) -> None:
        try:
            ttl = max(1, int((until - datetime.now(timezone.utc)).total_seconds()) + 5)
            self.client.set(f"deadline:{key}", str(until.timestamp()), ex=ttl)
        except Exception as e:
            logger.warning("Redis rate limiter deadline failed, using local memory: %s", e)
            self._fallback.set_deadline(key, until)

    def get_deadline(self, key: str) -> datetime | None:
        try:
            raw = self.client.get(f"deadline:{key}")
            if raw is None:
                return None
            until = datetime.fromtimestamp(float(raw), tz=timezone.utc)
            return until if until > datetime.now(timezone.utc) else None
        except Exception as e:
            logger.warning("Redis rate limiter deadline read failed, using local memory: %s", e)
            return self._fallback.get_deadline(key)

    def clear(self, key: str) -> None:
        try:
            self.client.delete(f"rate_limit:{key}", f"deadline:{key}")
        except Exception as e:
            logger.warning("Redis rate limiter clear failed, using local memory: %s", e)
            self._fallback.clear(key)


_default_limiter: RateLimiter | None = None


def get_rate_limiter() -> RateLimiter:
    """Return the active global rate limiter instance (Redis if configured, otherwise Memory)."""
    global _default_limiter
    if _default_limiter is None:
        try:
            from app.core.config import settings

            if getattr(settings, "redis_url", None):
                _default_limiter = RedisRateLimiter(settings.redis_url)
            else:
                _default_limiter = MemoryRateLimiter()
        except Exception as e:
            logger.warning("Could not initialize RedisRateLimiter, using MemoryRateLimiter: %s", e)
            _default_limiter = MemoryRateLimiter()
    return _default_limiter


def set_rate_limiter(limiter: RateLimiter) -> None:
    """Explicitly set the global rate limiter instance."""
    global _default_limiter
    _default_limiter = limiter

