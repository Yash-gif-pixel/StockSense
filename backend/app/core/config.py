from functools import cached_property
from typing import Literal
from zoneinfo import ZoneInfo

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEV_SECRET_KEY = "dev-insecure-secret-change-me"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    ENV: Literal["development", "test", "production"] = "development"
    SECRET_KEY: str = DEV_SECRET_KEY

    DATABASE_URL: str = "postgresql+psycopg://stocksense:stocksense@localhost:5432/stocksense"
    TEST_DATABASE_URL: str = (
        "postgresql+psycopg://stocksense:stocksense@localhost:5433/stocksense_test"
    )

    APP_TIMEZONE: str = "Asia/Kolkata"
    TOKEN_TTL_HOURS: int = 8
    OTP_TTL_MINUTES: int = 10
    OTP_MAX_ATTEMPTS: int = 5

    SMTP_HOST: str | None = None
    SMTP_PORT: int = 587
    SMTP_USER: str | None = None
    SMTP_PASSWORD: str | None = None
    SMTP_FROM: str = "no-reply@stocksense.local"
    SMTP_TLS: bool = True

    # Comma-separated. Kept as a plain string because pydantic-settings parses
    # list-typed fields as JSON, which makes "a,b" an error rather than a list.
    CORS_ORIGINS: str = "http://localhost:5173"

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def cookie_secure(self) -> bool:
        return self.ENV == "production"

    @cached_property
    def timezone(self) -> ZoneInfo:
        return ZoneInfo(self.APP_TIMEZONE)

    @property
    def smtp_configured(self) -> bool:
        return bool(self.SMTP_HOST)

    @model_validator(mode="after")
    def _production_needs_real_secret(self) -> "Settings":
        if self.ENV == "production" and self.SECRET_KEY == DEV_SECRET_KEY:
            raise ValueError("SECRET_KEY must be set to a real value when ENV=production")
        return self


settings = Settings()
