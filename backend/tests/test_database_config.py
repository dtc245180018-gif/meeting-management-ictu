from app.database import sqlalchemy_database_url


def test_provider_postgres_url_uses_psycopg_v3_driver():
    assert (
        sqlalchemy_database_url("postgresql://user:pass@example.com/database")
        == "postgresql+psycopg://user:pass@example.com/database"
    )
    assert (
        sqlalchemy_database_url("postgres://user:pass@example.com/database")
        == "postgresql+psycopg://user:pass@example.com/database"
    )


def test_explicit_driver_and_sqlite_urls_are_preserved():
    assert sqlalchemy_database_url("postgresql+psycopg://user:pass@example.com/database") == (
        "postgresql+psycopg://user:pass@example.com/database"
    )
    assert sqlalchemy_database_url("sqlite:///./meeting_management.db") == (
        "sqlite:///./meeting_management.db"
    )
