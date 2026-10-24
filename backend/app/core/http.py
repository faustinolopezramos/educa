"""HTTP-shaped helpers over database errors."""

from typing import Any

from fastapi import HTTPException, Request, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings


def commit_or_conflict(db: Session, detail: Any) -> None:
    """Commit, turning a constraint violation into a 409 instead of a 500.

    The schema enforces rules the endpoint has usually already checked in
    Python (double-booking, one mark per day, one score per evaluation). That
    check and the commit are not atomic, so a concurrent writer can still lose
    the race — and a course-wide change can move rows into a clash the request
    never inspected. Either way the caller asked for something the data model
    forbids, which is a conflict, not a server error.
    """
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail)


def client_ip(request: Request) -> str:
    """La dirección de quien hace la petición, la misma en todo el servidor.

    Sin proxy de confianza declarado se usa la del socket, que el cliente no
    puede falsear. Con él, se lee `CLIENT_IP_HEADER`: una cabecera de un solo
    valor puesta por la plataforma, o `X-Forwarded-For` tomando la entrada que
    añadió el último proxy de confianza (no la primera, que escribe el cliente).
    """
    if settings.trust_proxy_headers:
        header = settings.client_ip_header.strip().lower() or "x-forwarded-for"
        raw = request.headers.get(header)
        if raw:
            if header == "x-forwarded-for":
                hops = [p.strip() for p in raw.split(",") if p.strip()]
                if hops:
                    return hops[-settings.trusted_proxy_hops] if len(hops) >= settings.trusted_proxy_hops else hops[0]
            else:
                return raw.split(",")[0].strip()
    return request.client.host if request.client else "unknown"
