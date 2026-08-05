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
    meetings,
    notifications,
    payments,
    public,
    reports,
    rooms,
    schedules,
    sessions,
    teachers,
    tenants,
    users,
)
from app.webhooks import router as webhooks

# ---- In-memory rate limiter for login ----
#
# NOTE: this counter lives in the process, so N uvicorn workers enforce N times
# the limit and a restart forgets everything. It raises the cost of online
# password guessing; it is not a substitute for a shared (Redis) limiter once
# the API runs on more than one worker.
_login_attempts: dict[str, list[datetime]] = defaultdict(list)
LOGIN_RATE_LIMIT = 5  # max *failed* attempts
LOGIN_RATE_WINDOW = 60  # seconds

# `/auth/refresh` mints access tokens from a bearer secret, so it is the second
# guessable door into an account and was left unlimited. The budget is looser
# than login's because a real client legitimately refreshes on a schedule and
# several tabs may do so at once; it only has to make bulk guessing expensive.
_RATE_LIMITED_PATHS: dict[str, int] = {
    "/auth/login": LOGIN_RATE_LIMIT,
    "/auth/refresh": 20,
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
    now = datetime.now(timezone.utc)
    window_start = now - timedelta(seconds=LOGIN_RATE_WINDOW)
    recent = [t for t in _login_attempts[client_ip] if t > window_start]
    if recent:
        _login_attempts[client_ip] = recent
    else:
        # Nothing left in the window: drop the key instead of leaving an
        # empty list behind — otherwise every IP that has ever hit
        # one of these endpoints stays in memory for the life of the process.
        _login_attempts.pop(client_ip, None)

    if len(recent) >= limit:
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
        _login_attempts[client_ip].append(now)
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


app = FastAPI(title="Educa — Control Académico y Aula Virtual", version="0.1.0")
app.middleware("http")(rate_limit_middleware)
app.middleware("http")(cache_middleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?" if not settings.is_production else None,
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
app.include_router(meetings.router)
app.include_router(reports.router)
app.include_router(notifications.router)
app.include_router(payments.router)
app.include_router(public.router)
app.include_router(audit.router)
app.include_router(dashboard.router)
app.include_router(webhooks.router)
