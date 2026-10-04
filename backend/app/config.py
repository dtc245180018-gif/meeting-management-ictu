from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Meeting Management ICTU"
    database_url: str = "sqlite:///./meeting_management.db"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    admin_emails: str = ""
    leader_email: str = "leader@example.com"
    employee_one_email: str = "employee.one@example.com"
    employee_two_email: str = "employee.two@example.com"
    email_backend: str = "console"
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_from_email: str = ""
    smtp_use_tls: bool = True
    reminder_max_attempts: int = 3
    frontend_url: str = "http://localhost:5173"
    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = "http://localhost:8000/api/integrations/google/callback"
    google_token_encryption_key: str = ""
    google_oauth_state_secret: str = ""
    google_calendar_id: str = "primary"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def admin_email_list(self) -> set[str]:
        return {email.strip().lower() for email in self.admin_emails.split(",") if email.strip()}


@lru_cache
def get_settings() -> Settings:
    return Settings()
