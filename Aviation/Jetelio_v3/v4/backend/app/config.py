from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Process-level configuration. NOT the named-settings registry (see
    app.core.settings_registry / the `settings` DB table) — those are
    operational fallbacks a SUPER ADMIN can change at runtime without a
    deploy. This class is deployment wiring only: DSNs, secrets, ports.
    """

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    env: str = "development"
    database_url: str = "postgresql+asyncpg://jetelio:jetelio@localhost:15432/jetelio_v4"
    redis_url: str = "redis://localhost:6379/0"

    jwt_secret_key: str = "dev-only-change-me"
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 30
    jwt_refresh_token_expire_days: int = 14

    cors_origins: str = "*"
    base_url: str = "http://localhost:8080"

    s3_endpoint_url: str = "http://localhost:9000"
    s3_access_key: str = "jetelio"
    s3_secret_key: str = "change-me"
    s3_bucket_documents: str = "jetelio-documents"

    smtp_host: str = "localhost"
    smtp_port: int = 1025
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = "ops@jetelio.local"

    # Empty imap_host means "not configured" — email_poll_service.poll_inbox
    # is a no-op in that case (task #103), same NO_PROVIDER_CONFIGURED-style
    # honesty as every other optional integration in this system. Real
    # credentials are the user's to supply later via .env.
    imap_host: str = ""
    imap_port: int = 993
    imap_user: str = ""
    imap_password: str = ""
    imap_use_ssl: bool = True

    import_source_xlsx: str = "/app/data/JTLlayout-Index_admin.xlsx"

    # Named-settings seed defaults (also written into the `settings` table on
    # first migration/import so they are editable at runtime thereafter).
    default_permit_lead_time_hours: float = 72
    default_ground_notice_hours: float = 24
    range_reserve_margin: float = 0.15
    passport_validity_buffer_days: int = 180
    document_expiry_alert_days: str = "180,90,30,7"
    visa_rule_staleness_days: int = 365
    allow_unverified_for_planning: bool = False

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def document_expiry_alert_day_list(self) -> list[int]:
        return [int(d.strip()) for d in self.document_expiry_alert_days.split(",") if d.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
