"""The API's background jobs, run from a thread inside its own process.

Fly keeps one machine always running (`min_machines_running = 1`), so this is
enough without a separate worker: every few seconds the outbox is drained
(`app.services.delivery`), and every few minutes the weekly at-risk sweep is
checked (`app.services.risk_sweep`). A thread rather than a task because SMTP
and the HTTP client are blocking. With more than one process each runs its own
loop: `SKIP LOCKED` keeps the senders apart, and the sweep's unique index
keeps it to once a week.
"""

from __future__ import annotations

import logging
import threading
import time
from collections.abc import Callable

from sqlalchemy.orm import Session

from app.core.config import settings
from app.services.delivery import dispatch_pending
from app.services.risk_sweep import run_due_sweeps

logger = logging.getLogger(__name__)

# El barrido se comprueba cada diez minutos, no en cada vuelta: basta para
# lanzarlo a su hora y ahorra una consulta cada veinte segundos.
SWEEP_CHECK_EVERY = 600.0


class BackgroundJobs:
    def __init__(self, session_factory: Callable[[], Session], interval: float) -> None:
        self._session_factory = session_factory
        self._interval = interval
        self._last_sweep_check = 0.0
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._run, name="educa-background", daemon=True)

    def start(self) -> None:
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        self._thread.join(timeout=30)

    def _job(self, name: str, fn: Callable[[Session], object]) -> None:
        try:
            db = self._session_factory()
            try:
                result = fn(db)
            finally:
                db.close()
            if result:
                logger.info("%s: %s", name, result)
        except Exception:
            logger.exception("La tarea de fondo «%s» falló; el bucle sigue", name)

    def _run(self) -> None:
        while not self._stop.is_set():
            self._job("Envíos de notificaciones", lambda db: dict(dispatch_pending(db)))
            if time.monotonic() - self._last_sweep_check >= SWEEP_CHECK_EVERY:
                self._last_sweep_check = time.monotonic()
                self._job("Barridos de riesgo", run_due_sweeps)
            self._stop.wait(self._interval)


def start_background_jobs(session_factory: Callable[[], Session]) -> BackgroundJobs | None:
    interval = settings.background_jobs_interval_seconds
    if interval <= 0:
        return None
    jobs = BackgroundJobs(session_factory, interval)
    jobs.start()
    return jobs
