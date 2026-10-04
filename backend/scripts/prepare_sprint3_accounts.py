"""Create authentication-ready accounts for every active employee.

Run from the backend directory:

    python scripts/prepare_sprint3_accounts.py
    python scripts/prepare_sprint3_accounts.py --shared-demo-password "<demo-password>"

Temporary passwords are written only to the configured local CSV file. The
database stores salted hashes and the CSV is excluded from Git.
"""

import argparse
from pathlib import Path
import sys


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.database import Base, engine
from app.main import (
    apply_schema_migrations,
    migrate_employee_emails,
    seed_employees,
    seed_user_accounts,
    set_shared_sprint3_demo_password,
)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--shared-demo-password",
        help=(
            "Rotate every account to one temporary password for a supervised demo. "
            "Never use this option in production."
        ),
    )
    args = parser.parse_args()

    Base.metadata.create_all(bind=engine)
    apply_schema_migrations()
    migrate_employee_emails()
    seed_employees()
    created = seed_user_accounts()
    print(f"Sprint 3 accounts ready. Newly created accounts: {created}.")
    if args.shared_demo_password:
        rotated = set_shared_sprint3_demo_password(args.shared_demo_password)
        print(
            f"Shared demo password applied to {rotated} accounts; "
            "must_change_password remains enabled."
        )


if __name__ == "__main__":
    main()
