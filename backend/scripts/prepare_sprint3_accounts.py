"""Create authentication-ready accounts for every active employee.

Run from the backend directory:

    python scripts/prepare_sprint3_accounts.py

Temporary passwords are written only to the configured local CSV file. The
database stores salted hashes and the CSV is excluded from Git.
"""

from pathlib import Path
import sys


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.database import Base, engine
from app.main import (
    apply_schema_migrations,
    migrate_employee_emails,
    seed_employees,
    seed_user_accounts,
)


def main() -> None:
    Base.metadata.create_all(bind=engine)
    apply_schema_migrations()
    migrate_employee_emails()
    seed_employees()
    created = seed_user_accounts()
    print(f"Sprint 3 accounts ready. Newly created accounts: {created}.")


if __name__ == "__main__":
    main()
