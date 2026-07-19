from collections import defaultdict
from datetime import datetime, timedelta
from functools import wraps

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.config import settings
from app.routers import (
    attendance,
    audit,
    auth,
    catalog,
    enrollments,
    grades,
    grading,
    holidays,
    locations,
    meetings,
    notifications,
    reports,
    rooms,
    schedules,
    sessions,
    teachers,
    users,
)
from app.webhooks import router as webhooks

# ---- In-memory rate limiter for login ----
_login_attempts: dict[str, list[datetime]] = defaultdict(list)
LOGIN_RATE_LIMIT = 5       # max attempts
LOGIN_RATE_WINDOW = 60     # seconds


async def rate_limit_middleware(request: Request, call_next):
    if request.url.path == "/auth/login" and request.method == "POST":
        client_ip = request.client.host if request.client else "unknown"
        now = datetime.utcnow()
        window_start = now - timedelta(seconds=LOGIN_RATE_WINDOW)
        _login_attempts[client_ip] = [
            t for t in _login_attempts[client_ip] if t > window_start
        ]
        if len(_login_attempts[client_ip]) >= LOGIN_RATE_LIMIT:
            from fastapi.responses import JSONResponse

            return JSONResponse(
                status_code=429,
                content={"detail": "Demasiados intentos. Espera un minuto."},
            )
        _login_attempts[client_ip].append(now)
    return await call_next(request)


# ---- Cache-Control for GET catalog endpoints ----
async def cache_middleware(request: Request, call_next):
    response = await call_next(request)
    if request.method == "GET":
        path = request.url.path
        if path.startswith(("/catalog/", "/rooms", "/health")):
            response.headers.setdefault("Cache-Control", "max-age=30")
        elif path.startswith(("/schedules", "/teachers", "/holidays")):
            response.headers.setdefault("Cache-Control", "max-age=15")
    return response


app = FastAPI(title="Educa — Control Académico y Aula Virtual", version="0.1.0")
app.middleware("http")(rate_limit_middleware)
app.middleware("http")(cache_middleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", tags=["health"])
def health() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(auth.router)
app.include_router(users.router)
app.include_router(catalog.router)
app.include_router(rooms.router)
app.include_router(teachers.router)
app.include_router(schedules.router)
app.include_router(sessions.router)
app.include_router(holidays.router)
app.include_router(locations.router)
app.include_router(enrollments.router)
app.include_router(attendance.router)
app.include_router(grades.router)
app.include_router(grading.router)
app.include_router(meetings.router)
app.include_router(reports.router)
app.include_router(notifications.router)
app.include_router(audit.router)
app.include_router(webhooks.router)
