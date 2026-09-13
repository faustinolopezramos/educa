"""Rate limiter implementations: In-memory sliding window and Redis.

In development and single-worker setups, MemoryRateLimiter is used by default.
In production with multiple workers, RedisRateLimiter can be used by setting REDIS_URL.
"""

from __future__ import annotations

import logging
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Protocol

logger = logging.getLogger(__name__)


class RateLimiter(Protocol):
    def is_rate_limited(self, bucket_key: str, limit: int, window_seconds: int) -> bool:
        ...

    def record_failed_attempt(self, bucket_key: str, window_seconds: int) -> None:
        ...


class MemoryRateLimiter:
    """Sliding-window rate limiter in process memory with opportunistic pruning."""

    def __init__(self, storage: dict[str, list[datetime]] | None = None) -> None:
        self.attempts: dict[str, list[datetime]] = storage if storage is not None else defaultdict(list)

    def is_rate_limited(self, bucket_key: str, limit: int, window_seconds: int) -> bool:
        now = datetime.now(timezone.utc)
        window_start = now - timedelta(seconds=window_seconds)
        recent = [t for t in self.attempts.get(bucket_key, []) if t > window_start]
        if recent:
            self.attempts[bucket_key] = recent
        else:
            self.attempts.pop(bucket_key, None)
        return len(recent) >= limit

    def record_failed_attempt(self, bucket_key: str, window_seconds: int) -> None:
        now = datetime.now(timezone.utc)
        if bucket_key not in self.attempts:
            self.attempts[bucket_key] = []
        self.attempts[bucket_key].append(now)


class RedisRateLimiter:
    """Distributed sliding-window rate limiter using Redis sorted sets."""

    def __init__(self, redis_url: str) -> None:
        import redis  # type: ignore[import-untyped]

        self.client = redis.from_url(redis_url, decode_responses=True)

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
            logger.warning("Redis rate limiter check failed, allowing request: %s", e)
            return False

    def record_failed_attempt(self, bucket_key: str, window_seconds: int) -> None:
        try:
            now_ts = datetime.now(timezone.utc).timestamp()
            key = f"rate_limit:{bucket_key}"
            pipe = self.client.pipeline()
            pipe.zadd(key, {str(now_ts): now_ts})
            pipe.expire(key, window_seconds + 5)
            pipe.execute()
        except Exception as e:
            logger.warning("Redis rate limiter record failed: %s", e)
