from collections import defaultdict
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from functools import wraps

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from starlette.concurrency import run_in_threadpool
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.config import settings
from app.core.database import SessionLocal
from app.core.http import client_ip
from app.routers import (
    academy,
    assignments,
    attendance,
    audit,
    auth,
    auth_security,
    catalog,
    dashboard,
    enrollments,
    grades,
    grading,
    holidays,
    locations,
    ludi,
    makeups,
    meetings,
    notifications,
    payments,
    push,
    renewals,
    reports,
    rooms,
    schedules,
    sessions,
    teachers,
    tenants,
    users,
)
from app.services.background import start_background_jobs
from app.webhooks import router as webhooks

# ---- Rate limiter for login & refresh (In-memory or Redis) ----
from app.core.rate_limiter import MemoryRateLimiter, RedisRateLimiter, set_rate_limiter

_login_attempts: dict[str, list[datetime]] = defaultdict(list)
_memory_limiter = MemoryRateLimiter(_login_attempts)
_redis_limiter = RedisRateLimiter(settings.redis_url) if settings.redis_url else None
_rate_limiter = _redis_limiter if _redis_limiter else _memory_limiter
set_rate_limiter(_rate_limiter)

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
    # Crear una academia no falla con 401: lo que hay que frenar son las altas
    # en masa, así que aquí cuenta cada intento y no sólo los fallidos.
    "/auth/register-academy": 3,
    # Adivinar el código de 6 dígitos del segundo factor. Cuenta los fallos
    # (401); el bloqueo por cuenta de `account_lockout` es el tope duro.
    "/auth/mfa/verify": LOGIN_RATE_LIMIT,
    # Cada petición manda un correo y adivinar un token firmado de reseteo es
    # inviable, pero ambas puertas estaban abiertas al ruido y al abuso.
    "/auth/forgot-password": 5,
    "/auth/reset-password": 10,
    # Acceso con passkey: el primer paso es público y deja una fila (el desafío)
    # por llamada, así que cuenta cada una; el segundo cuenta los fallos.
    "/auth/webauthn/authenticate/start": 10,
    "/auth/webauthn/authenticate/finish": LOGIN_RATE_LIMIT * 2,
}

# Rutas en las que cada intento gasta presupuesto, salga bien o mal.
_COUNT_EVERY_ATTEMPT: frozenset[str] = frozenset(
    {
        "/auth/register-academy",
        "/auth/forgot-password",
        "/auth/reset-password",
        "/auth/webauthn/authenticate/start",
    }
)


def _client_key(request: Request) -> str:
    """Who to count this attempt against (ver `app.core.http.client_ip`)."""
    return client_ip(request)


def _bucket_key(request: Request) -> str:
    """Which counter this request spends from.

    Keyed by path as well as caller, so exhausting the refresh budget cannot
    lock the same client out of logging in (or the reverse). Kept as a named
    function because the bookkeeping tests need to look the bucket up the same
    way the middleware files it — hardcoding the shape in a test let one of them
    keep passing against a key nothing wrote to any more.
    """
    return f"{request.url.path}|{_client_key(request)}"


async def _limiter_call(fn, *args):
    """Run a limiter method without stalling the event loop.

    Redis is a network round trip on a synchronous client; awaited inline it
    froze every other request on this single worker while it waited. The
    in-memory limiter stays on the loop: it is microseconds of dict work, and
    keeping it single-threaded spares its lists from concurrent mutation.
    """
    if _rate_limiter is _memory_limiter:
        return fn(*args)
    return await run_in_threadpool(fn, *args)


async def rate_limit_middleware(request: Request, call_next):
    limit = _RATE_LIMITED_PATHS.get(request.url.path)
    if limit is None or request.method != "POST":
        return await call_next(request)

    client_ip = _bucket_key(request)

    if await _limiter_call(_rate_limiter.is_rate_limited, client_ip, limit, LOGIN_RATE_WINDOW):
        from fastapi.responses import JSONResponse

        return JSONResponse(
            status_code=429,
            content={"detail": "Demasiados intentos. Espera un minuto."},
        )

    response = await call_next(request)
    # Only *failed* logins count. Charging successful ones locked out shared
    # networks — a classroom behind one NAT address ran out of budget after
    # five students signed in normally.
    if response.status_code == 401 or request.url.path in _COUNT_EVERY_ATTEMPT:
        await _limiter_call(_rate_limiter.record_failed_attempt, client_ip, LOGIN_RATE_WINDOW)
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

        # La respuesta depende de quién pregunta. `private` evita el caché
        # compartido, pero el del navegador se indexa por URL: en un equipo
        # compartido, quien entraba después recibía la respuesta del anterior
        # mientras durara `max-age`. `Vary` lo hace distinguir por credencial.
        if response.headers.get("Cache-Control", "").startswith("private"):
            response.headers.append("Vary", "Authorization")
    return response


# En producción no se publica el esquema de la API. No es un secreto que la
# proteja, pero es el mapa completo de endpoints y formas de petición servido a
# cualquiera que pase; en desarrollo sigue estando, que es donde hace falta.
_docs_enabled = not settings.is_production

def _report_rls_posture() -> None:
    """Deja en el log si las políticas de RLS están en vigor para esta API."""
    import logging

    from app.core.rls import connection_bypasses_rls

    log = logging.getLogger("app.rls")
    with SessionLocal() as db:
        bypass = connection_bypasses_rls(db)
    if bypass:
        log.warning(
            "El rol de la base de datos se salta RLS: el aislamiento entre academias "
            "depende sólo de los filtros de la API (ver DEPLOYMENT.md, «Row Level Security»)."
        )
    elif bypass is False:
        log.info("RLS en vigor para el rol de la API.")
        if settings.background_jobs_interval_seconds > 0:
            # Las tareas de fondo abren su sesión sin usuario, así que no fijan
            # contexto de RLS: con las políticas en vigor leerían tablas vacías
            # sin dar ningún error.
            log.warning(
                "Las tareas de fondo corren sin contexto de RLS y con este rol no verán las "
                "filas de ninguna academia: no se enviarán avisos ni correrá el barrido de riesgo."
            )


def _report_limiter_posture() -> None:
    """Avisa de que los bloqueos viven en memoria: se pierden en cada despliegue."""
    import logging

    if settings.web_concurrency > 1 and not settings.redis_url:
        logging.getLogger("app.limiter").warning(
            "WEB_CONCURRENCY=%s sin REDIS_URL: cada proceso cuenta sus propios intentos, "
            "así que los límites de login valen %s veces lo configurado.",
            settings.web_concurrency,
            settings.web_concurrency,
        )
    elif settings.is_production and not settings.redis_url:
        logging.getLogger("app.limiter").warning(
            "Sin REDIS_URL, los límites de intentos y el bloqueo de cuentas viven en la "
            "memoria del proceso: se reinician con cada despliegue y no se comparten entre "
            "máquinas (ver DEPLOYMENT.md)."
        )


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Tareas de fondo: enviar los avisos por correo/WhatsApp y el barrido
    # semanal de alumnos en riesgo (app/services/background.py).
    loop = start_background_jobs(SessionLocal)
    _report_rls_posture()
    _report_limiter_posture()
    try:
        yield
    finally:
        if loop is not None:
            loop.stop()


app = FastAPI(
    lifespan=lifespan,
    title="Educa — Control Académico y Aula Virtual",
    version="0.1.0",
    docs_url="/docs" if _docs_enabled else None,
    redoc_url="/redoc" if _docs_enabled else None,
    openapi_url="/openapi.json" if _docs_enabled else None,
)
async def security_headers_middleware(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(self), microphone=(self), geolocation=()"
    if settings.is_production:
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


# El último registrado es el más externo. Las cabeceras de seguridad van por
# fuera de todo lo demás para que también las lleve el 429 que el limitador
# devuelve sin llegar a los endpoints.
app.middleware("http")(cache_middleware)
app.middleware("http")(rate_limit_middleware)
app.middleware("http")(security_headers_middleware)

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
app.include_router(auth_security.router)
app.include_router(tenants.router)
app.include_router(academy.router)
app.include_router(users.router)
app.include_router(catalog.router)
app.include_router(rooms.router)
app.include_router(teachers.router)
app.include_router(schedules.router)
app.include_router(sessions.router)
app.include_router(holidays.router)
app.include_router(locations.router)
app.include_router(enrollments.router)
app.include_router(renewals.router)
app.include_router(assignments.router)
app.include_router(attendance.router)
app.include_router(grades.router)
app.include_router(grading.router)
app.include_router(makeups.router)
app.include_router(meetings.router)
app.include_router(reports.router)
app.include_router(notifications.router)
app.include_router(push.router)
app.include_router(payments.router)
app.include_router(audit.router)
app.include_router(dashboard.router)
app.include_router(ludi.router)
app.include_router(webhooks.router)
