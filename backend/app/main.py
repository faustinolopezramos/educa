from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.routers import (
    attendance,
    auth,
    catalog,
    enrollments,
    grades,
    meetings,
    rooms,
    schedules,
    teachers,
    users,
)
from app.webhooks import router as webhooks

app = FastAPI(title="Educa — Control Académico y Aula Virtual", version="0.1.0")

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
app.include_router(enrollments.router)
app.include_router(attendance.router)
app.include_router(grades.router)
app.include_router(meetings.router)
app.include_router(webhooks.router)
