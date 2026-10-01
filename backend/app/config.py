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
