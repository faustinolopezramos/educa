from pydantic import BaseModel, Field


class PushKeys(BaseModel):
    p256dh: str = Field(min_length=1, max_length=255)
    auth: str = Field(min_length=1, max_length=255)


class PushSubscriptionIn(BaseModel):
    """Lo que devuelve `PushSubscription.toJSON()` en el navegador."""

    endpoint: str = Field(min_length=1, max_length=2048, pattern=r"^https://")
    keys: PushKeys


class PushUnsubscribeIn(BaseModel):
    endpoint: str = Field(min_length=1, max_length=2048)


class PushConfig(BaseModel):
    #: Vacío cuando el servidor no tiene Web Push configurado.
    public_key: str
