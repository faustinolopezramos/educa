"""Suscribir o dar de baja un dispositivo a los avisos push."""

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models import PushSubscription, User
from app.schemas.push import PushConfig, PushSubscriptionIn, PushUnsubscribeIn
from app.services.push import push_configured

router = APIRouter(prefix="/push", tags=["push"])


@router.get("/config", response_model=PushConfig)
def config(_: User = Depends(get_current_user)) -> PushConfig:
    """La clave pública VAPID que el navegador necesita para suscribirse."""
    return PushConfig(public_key=settings.vapid_public_key if push_configured() else "")


@router.post("/subscriptions", status_code=status.HTTP_204_NO_CONTENT)
def subscribe(
    payload: PushSubscriptionIn,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    """Alta (o actualización) de este dispositivo para el usuario que llama.

    Si el endpoint ya existía —el mismo navegador que se vuelve a suscribir, o
    un teléfono compartido donde ahora entra otra persona— la fila pasa a quien
    llama: los avisos de un dispositivo son de quien tiene la sesión abierta en él.
    """
    if not push_configured():
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Los avisos push no están configurados")
    sub = db.scalar(select(PushSubscription).where(PushSubscription.endpoint == payload.endpoint))
    if sub is None:
        sub = PushSubscription(endpoint=payload.endpoint)
        db.add(sub)
    sub.user_id = current_user.id
    sub.p256dh = payload.keys.p256dh
    sub.auth = payload.keys.auth
    sub.user_agent = (request.headers.get("user-agent") or "")[:255] or None
    db.commit()


@router.post("/subscriptions/remove", status_code=status.HTTP_204_NO_CONTENT)
def unsubscribe(
    payload: PushUnsubscribeIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    """Baja de este dispositivo. Sólo la propia: un endpoint ajeno no se toca."""
    db.execute(
        delete(PushSubscription).where(
            PushSubscription.endpoint == payload.endpoint,
            PushSubscription.user_id == current_user.id,
        )
    )
    db.commit()
