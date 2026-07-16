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
    jwt_expire_minutes: int = 1440

    # Encryption for provider credentials at rest
    fernet_key: str = ""

    # Shared secret used to verify inbound provider webhooks. Empty means we
    # cannot authenticate callers, so webhooks are rejected (fail closed).
    webhook_secret: str = ""

    # CORS
    cors_origins: str = "http://localhost:5173"

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
    def _reject_placeholder_secrets(self) -> "Settings":
        """Refuse to start production with the example secrets still in place.

        Development keeps working with the defaults, but warns, so the failure
        surfaces long before deploy day.
        """
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
