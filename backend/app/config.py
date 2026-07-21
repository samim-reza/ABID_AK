from functools import lru_cache
from urllib.parse import quote_plus

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application configuration loaded from environment / .env file."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # --- Project ---
    project_name: str = "ABID AK Contracting — Expense Management"
    api_v1_prefix: str = "/api"
    environment: str = "development"

    # --- Auth ---
    secret_key: str = "change-me-in-production-please-use-a-long-random-string"
    access_token_expire_minutes: int = 60 * 24 * 7  # 7 days
    algorithm: str = "HS256"

    # --- Bootstrap admin (created on first run if no users exist) ---
    admin_username: str = "admin"
    admin_password: str = "abidak2024"
    admin_full_name: str = "System Administrator"

    # --- VAT ---
    vat_rate: float = 0.15  # Saudi Arabia standard VAT

    # --- CORS ---
    cors_origins: str = "http://localhost:3000,https://samimreza.me"

    # --- Database (Supabase Postgres via pooler) ---
    database_url: str | None = None  # full DSN override wins if provided
    supabase_db_password: str = ""
    supabase_project_ref: str = ""
    supabase_pooler_host: str = ""
    supabase_pooler_port: int = 5432
    supabase_db_name: str = "postgres"

    @property
    def sqlalchemy_database_uri(self) -> str:
        if self.database_url:
            return self.database_url
        user = f"postgres.{self.supabase_project_ref}"
        pwd = quote_plus(self.supabase_db_password)
        return (
            f"postgresql+psycopg2://{user}:{pwd}"
            f"@{self.supabase_pooler_host}:{self.supabase_pooler_port}/{self.supabase_db_name}"
        )

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
