import logging
from functools import lru_cache

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)

# Placeholders shipped in .env.example. Signing real tokens with one of these
# means anyone who has read the repo can mint an admin session.
_PLACEHOLDER_SECRETS = {
    "",
    "change-me",
    "change-me-in-production-use-a-long-random-string",
}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    # "development" | "production". Production refuses to boot on a weak config.
    environment: str = "development"

    # Database
    database_url: str = "postgresql+psycopg://educa:educa@localhost:5432/educa"

    # JWT
    jwt_secret: str = "change-me"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 30
    # Short-ish on purpose: the refresh token lives in localStorage (readable
    # by any script running on the page), so a shorter life plus rotation
    # (see RefreshSession) bounds how long a stolen one stays useful.
    refresh_token_expire_days: int = 7

    # Encryption for provider credentials at rest
    fernet_key: str = ""

    # Shared secret used to verify inbound provider webhooks. Empty means we
    # cannot authenticate callers, so webhooks are rejected (fail closed).
    webhook_secret: str = ""

    # The academy's own wall-clock. A schedule stores "the class runs 18:00–20:00"
    # with no zone attached, because that is how a timetable is planned: local
    # time, the same for everyone in the building. Comparing that against the
    # server's clock only works if the server happens to sit in the same zone —
    # on a UTC host it shifted the whole lobby window by six hours.
    academy_timezone: str = "America/Guatemala"

    # Supabase Auth. Sólo se usan para validar contra Supabase el token que el
    # navegador presenta en /auth/supabase-login; si faltan, ese endpoint queda
    # deshabilitado y el login propio sigue funcionando igual.
    supabase_url: str = ""
    supabase_anon_key: str = ""

    # CORS
    cors_origins: str = (
        "http://localhost:5173,http://127.0.0.1:5173,"
        "http://localhost:3000,http://127.0.0.1:3000,"
        "http://localhost:5174,http://127.0.0.1:5174"
    )
    # Patrón adicional de orígenes permitidos, para los despliegues de vista
    # previa. Vacío por defecto: un comodín como `https://.*\.vercel\.app` deja
    # entrar a cualquiera que publique en ese dominio, que es de quien sea.
    cors_origin_regex: str | None = None

    # Set to true only when the API genuinely sits behind a reverse proxy that
    # rewrites `X-Forwarded-For`. Left false, the login rate limiter counts by
    # the socket's own address, which a client cannot forge.
    trust_proxy_headers: bool = False

    # Optional Redis URL for distributed rate limiting in multi-worker production
    redis_url: str | None = None

    # Correo saliente (SMTP). Sin SMTP_HOST el correo no se envía: las
    # notificaciones se quedan sólo en la campana. Sirve cualquier proveedor que
    # hable SMTP (Resend, Brevo, SendGrid, Google Workspace…). El puerto 465 usa
    # SSL directo; cualquier otro, STARTTLS.
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    email_from: str = "notificaciones@educa.com"

    # WhatsApp Cloud API (Meta). Los mensajes que inicia la academia sólo pueden
    # ser plantillas aprobadas por Meta — ver DEPLOYMENT.md para las que usa Educa.
    whatsapp_token: str = ""
    whatsapp_phone_number_id: str = ""
    whatsapp_api_version: str = "v23.0"
    whatsapp_template_language: str = "es"
    # Prefijo que se antepone a un teléfono guardado sin código de país.
    whatsapp_default_country_code: str = "502"

    # Avisos push del navegador (Web Push). Las claves VAPID identifican a este
    # servidor ante los servicios de push; se generan una vez con
    # `python -m app.cli generate-vapid-keys` y no se cambian (cambiarlas deja
    # inservibles todas las suscripciones existentes).
    vapid_public_key: str = ""
    vapid_private_key: str = ""
    vapid_subject: str = "mailto:soporte@educa.com"

    # Enlace a la aplicación que se añade al pie de los correos. Vacío = sin enlace.
    app_url: str = ""

    # Cada cuántos segundos corren las tareas de fondo de la API: vaciar la cola
    # de envíos y, cuando toca, el barrido semanal de riesgo. 0 las desactiva
    # (quedan los comandos `dispatch-notifications` y `at-risk-sweep` del CLI).
    background_jobs_interval_seconds: int = 20

    # Barrido semanal de alumnos en riesgo: qué día (0 = lunes) y a partir de
    # qué hora de la academia se lanza. Si la API estaba apagada a esa hora, se
    # lanza en cuanto vuelve, dentro de la misma semana.
    at_risk_sweep_enabled: bool = True
    at_risk_sweep_weekday: int = 0
    at_risk_sweep_hour: int = 7

    # Seed
    seed_admin_email: str = "admin@educa.com"
    seed_admin_password: str = "admin123"
    seed_admin_name: str = "Administrador"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def is_production(self) -> bool:
        return self.environment.strip().lower() == "production"

    @model_validator(mode="after")
    def _normalize_and_validate(self) -> "Settings":
        """Ensure postgresql+psycopg driver is used and validate production secrets."""
        if self.database_url.startswith("postgresql://"):
            self.database_url = self.database_url.replace("postgresql://", "postgresql+psycopg://", 1)
        elif self.database_url.startswith("postgres://"):
            self.database_url = self.database_url.replace("postgres://", "postgresql+psycopg://", 1)

        # Remove invalid query parameter 'pgbouncer' (psycopg 3 rejects it)
        if "pgbouncer=" in self.database_url:
            import re
            self.database_url = re.sub(r'[\?&]pgbouncer=[^&]*', '', self.database_url)
            if "?" not in self.database_url and "&" in self.database_url:
                self.database_url = self.database_url.replace("&", "?", 1)

        # El SSL es una propiedad del destino, no del código: en producción la
        # base vive en Supabase y la conexión debe ir cifrada, mientras que el
        # Postgres local ni siquiera habla SSL. Se decide aquí, sobre la URL, en
        # vez de en `connect_args`, que aplicaba a los tres entornos por igual.
        if self.is_production and "sslmode=" not in self.database_url:
            sep = "&" if "?" in self.database_url else "?"
            self.database_url = f"{self.database_url}{sep}sslmode=require"

        weak = self.jwt_secret.strip() in _PLACEHOLDER_SECRETS
        if not weak:
            return self
        if self.is_production:
            raise ValueError(
                "JWT_SECRET is still the placeholder from .env.example. Generate one "
                'with: python -c "import secrets; print(secrets.token_urlsafe(48))"'
            )
        logger.warning(
            "JWT_SECRET is a placeholder. Fine for local development, but set a real "
            "one before deploying (ENVIRONMENT=production will refuse to start)."
        )
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
