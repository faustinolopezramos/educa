import ipaddress
from urllib.parse import urlparse

from pydantic import BaseModel, Field, field_validator


def is_safe_push_endpoint(endpoint: str) -> bool:
    """Validate that a push subscription endpoint is a secure, public HTTPS URL.

    Rejects private network IPs, loopback, link-local (including cloud metadata),
    and internal domains to mitigate SSRF vectors.
    """
    try:
        parsed = urlparse(endpoint)
        if parsed.scheme.lower() != "https" or not parsed.hostname:
            return False
        hostname = parsed.hostname.lower()
        if (
            hostname in ("localhost", "::1", "127.0.0.1", "0.0.0.0")
            or hostname.endswith(".local")
            or hostname.endswith(".internal")
            or hostname.endswith(".localhost")
            or hostname.endswith(".lan")
        ):
            return False
        try:
            ip = ipaddress.ip_address(hostname)
            if (
                ip.is_private
                or ip.is_loopback
                or ip.is_link_local
                or ip.is_multicast
                or ip.is_reserved
                or ip.is_unspecified
            ):
                return False
        except ValueError:
            pass
        return True
    except Exception:
        return False


class PushKeys(BaseModel):
    p256dh: str = Field(min_length=1, max_length=255)
    auth: str = Field(min_length=1, max_length=255)


class PushSubscriptionIn(BaseModel):
    """Lo que devuelve `PushSubscription.toJSON()` en el navegador."""

    endpoint: str = Field(min_length=1, max_length=2048, pattern=r"^https://")
    keys: PushKeys

    @field_validator("endpoint")
    @classmethod
    def _validate_endpoint(cls, v: str) -> str:
        if not is_safe_push_endpoint(v):
            raise ValueError("Endpoint de suscripción push inválido o no permitido")
        return v


class PushUnsubscribeIn(BaseModel):
    endpoint: str = Field(min_length=1, max_length=2048)


class PushConfig(BaseModel):
    #: Vacío cuando el servidor no tiene Web Push configurado.
    public_key: str
