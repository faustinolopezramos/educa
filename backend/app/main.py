from collections import defaultdict
from datetime import datetime, timedelta, timezone
from functools import wraps

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.config import settings
from app.routers import (
    assignments,
    attendance,
    audit,
    auth,
    catalog,
    dashboard,
    enrollments,
    grades,
    grading,
    holidays,
    locations,
    makeups,
    meetings,
    notifications,
    payments,
    reports,
    rooms,
    schedules,
    sessions,
    teachers,
    tenants,
    users,
)
from app.webhooks import router as webhooks

# ---- Rate limiter for login & refresh (In-memory or Redis) ----
from app.core.rate_limiter import MemoryRateLimiter, RedisRateLimiter

_login_attempts: dict[str, list[datetime]] = defaultdict(list)
_memory_limiter = MemoryRateLimiter(_login_attempts)
_redis_limiter = RedisRateLimiter(settings.redis_url) if settings.redis_url else None
_rate_limiter = _redis_limiter if _redis_limiter else _memory_limiter

LOGIN_RATE_LIMIT = 5  # max *failed* attempts
LOGIN_RATE_WINDOW = 60  # seconds

# `/auth/refresh` mints access tokens from a bearer secret, so it is the second
# guessable door into an account and was left unlimited. The budget is looser
# than login's because a real client legitimately refreshes on a schedule and
# several tabs may do so at once; it only has to make bulk guessing expensive.
_RATE_LIMITED_PATHS: dict[str, int] = {
    "/auth/login": LOGIN_RATE_LIMIT,
    "/auth/refresh": 20,
    # Canjear un token de Supabase por uno propio es otra puerta de entrada a
    # una cuenta, así que cuesta lo mismo que la principal.
    "/auth/supabase-login": LOGIN_RATE_LIMIT,
}


def _client_key(request: Request) -> str:
    """Who to count this attempt against.

    `X-Forwarded-For` is only honoured when the deployment says it sits behind
    a proxy it trusts. Reading it unconditionally would let any client forge a
    fresh identity per request and opt out of the limit entirely.
    """
    if settings.trust_proxy_headers:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _bucket_key(request: Request) -> str:
    """Which counter this request spends from.

    Keyed by path as well as caller, so exhausting the refresh budget cannot
    lock the same client out of logging in (or the reverse). Kept as a named
    function because the bookkeeping tests need to look the bucket up the same
    way the middleware files it — hardcoding the shape in a test let one of them
    keep passing against a key nothing wrote to any more.
    """
    return f"{request.url.path}|{_client_key(request)}"


async def rate_limit_middleware(request: Request, call_next):
    limit = _RATE_LIMITED_PATHS.get(request.url.path)
    if limit is None or request.method != "POST":
        return await call_next(request)

    client_ip = _bucket_key(request)

    if _rate_limiter.is_rate_limited(client_ip, limit, LOGIN_RATE_WINDOW):
        from fastapi.responses import JSONResponse

        return JSONResponse(
            status_code=429,
            content={"detail": "Demasiados intentos. Espera un minuto."},
        )

    response = await call_next(request)
    # Only *failed* logins count. Charging successful ones locked out shared
    # networks — a classroom behind one NAT address ran out of budget after
    # five students signed in normally.
    if response.status_code == 401:
        _rate_limiter.record_failed_attempt(client_ip, LOGIN_RATE_WINDOW)
    return response


# ---- Cache-Control for GET catalog endpoints ----
async def cache_middleware(request: Request, call_next):
    response = await call_next(request)
    if request.method == "GET":
        path = request.url.path
        if path == "/health":
            # Unauthenticated and identical for everyone: safe for a shared cache.
            response.headers.setdefault("Cache-Control", "max-age=30")
        elif path.startswith(("/catalog/", "/rooms")):
            # These require auth. `private` keeps a shared proxy/CDN from ever
            # serving a cached body to a request it never checked the
            # Authorization header on.
            response.headers.setdefault("Cache-Control", "private, max-age=30")
        elif path.startswith(("/schedules", "/teachers", "/holidays")):
            response.headers.setdefault("Cache-Control", "private, max-age=15")
    return response


# En producción no se publica el esquema de la API. No es un secreto que la
# proteja, pero es el mapa completo de endpoints y formas de petición servido a
# cualquiera que pase; en desarrollo sigue estando, que es donde hace falta.
_docs_enabled = not settings.is_production

app = FastAPI(
    title="Educa — Control Académico y Aula Virtual",
    version="0.1.0",
    docs_url="/docs" if _docs_enabled else None,
    redoc_url="/redoc" if _docs_enabled else None,
    openapi_url="/openapi.json" if _docs_enabled else None,
)
app.middleware("http")(rate_limit_middleware)
app.middleware("http")(cache_middleware)

# En producción sólo entran los orígenes declarados en CORS_ORIGINS, más el
# patrón opcional CORS_ORIGIN_REGEX para las vistas previas del propio proyecto.
# El comodín anterior, `https://.*\.vercel\.app`, abría la API a cualquier sitio
# publicado en Vercel, que puede ser el de cualquiera.
_origin_regex = (
    settings.cors_origin_regex
    if settings.is_production
    else r"https?://(localhost|127\.0\.0\.1)(:\d+)?"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_origin_regex=_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", tags=["health"])
def health() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(auth.router)
app.include_router(tenants.router)
app.include_router(users.router)
app.include_router(catalog.router)
app.include_router(rooms.router)
app.include_router(teachers.router)
app.include_router(schedules.router)
app.include_router(sessions.router)
app.include_router(holidays.router)
app.include_router(locations.router)
app.include_router(enrollments.router)
app.include_router(assignments.router)
app.include_router(attendance.router)
app.include_router(grades.router)
app.include_router(grading.router)
app.include_router(makeups.router)
app.include_router(meetings.router)
app.include_router(reports.router)
app.include_router(notifications.router)
app.include_router(payments.router)
app.include_router(audit.router)
app.include_router(dashboard.router)
app.include_router(webhooks.router)
