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
    notification_retention_days: int = 30
    frontend_url: str = "http://localhost:5173"
    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = "http://localhost:8000/api/integrations/google/callback"
    google_token_encryption_key: str = ""
    google_oauth_state_secret: str = ""
    google_calendar_id: str = "primary"
    google_allowed_domain: str = "ictu.edu.vn"
    sprint3_seed_accounts: bool = True
    sprint3_credentials_file: str = "sprint3_credentials.local.csv"
    auth_required: bool = True
    auth_secret_key: str = ""
    auth_token_minutes: int = 480
    chatbot_confirmation_minutes: int = 10
    qr_token_minutes: int = 720
    qr_checkin_early_minutes: int = 30
    qr_checkout_grace_minutes: int = 60
    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.5-flash-lite"
    gemini_timeout_seconds: float = 20.0
    initial_account_password: str = "ICTU123"
    hrm_connector: str = "mock"
    hrm_mock_data_file: str = "data/hrm_mock.json"
    hrm_default_role: str = "participant"
    hrm_sync_interval_minutes: int = 0

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
