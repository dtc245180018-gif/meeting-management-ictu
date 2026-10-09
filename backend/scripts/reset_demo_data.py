"""Reset the configured database to a clean state for a manual demo.

This removes meetings, invitations, reminders and resource bookings, then
restores the canonical ICTU room, equipment and employee directory. It does not add
sample meetings; the presenter creates them during the demo.

Run from the backend directory:

    python scripts/reset_demo_data.py
    python scripts/reset_demo_data.py --full --shared-demo-password ICTU123
"""

import argparse
from pathlib import Path
import sys


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import delete

from app import models
from app.database import Base, SessionLocal, engine
from app.config import get_settings
from app.main import (
    apply_schema_migrations,
    migrate_employee_emails,
    seed_employees,
    seed_equipment,
    seed_rooms,
    seed_user_accounts,
    set_shared_sprint3_demo_password,
)


def reset_demo_database(*, full: bool = False, shared_demo_password: str | None = None) -> int:
    Base.metadata.create_all(bind=engine)
    apply_schema_migrations()
    migrate_employee_emails()

    with SessionLocal() as db:
        db.execute(delete(models.GoogleCalendarEvent))
        db.execute(delete(models.Reminder))
        db.execute(delete(models.EquipmentBooking))
        db.execute(delete(models.RoomBooking))
        db.execute(delete(models.Participant))
        db.execute(delete(models.Meeting))
        db.execute(delete(models.RoomAccessPolicy))
        db.execute(delete(models.Room))
        db.execute(delete(models.Equipment))
        if full:
            db.execute(delete(models.AccountAuditLog))
            db.execute(delete(models.GoogleCalendarConnection))
            db.execute(delete(models.UserAccount))
            db.execute(delete(models.Employee))
        db.commit()

    seed_rooms()
    seed_employees()
    created_accounts = seed_user_accounts()
    seed_equipment()

    rotated_accounts = 0
    if full or shared_demo_password is not None:
        password = shared_demo_password or get_settings().initial_account_password
        rotated_accounts = set_shared_sprint3_demo_password(password)
        if not rotated_accounts:
            raise RuntimeError(
                "Không có tài khoản nào để đặt lại. Hãy bật SPRINT3_SEED_ACCOUNTS rồi chạy lại."
            )

    return rotated_accounts or created_accounts


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--full",
        action="store_true",
        help=(
            "Reset cả tài khoản, quyền phòng, audit log và kết nối Google; "
            "sau đó tạo lại dữ liệu chuẩn."
        ),
    )
    parser.add_argument(
        "--shared-demo-password",
        help=(
            "Đặt một mật khẩu tạm chung cho toàn bộ tài khoản demo. "
            "Nếu dùng --full mà bỏ trống, hệ thống dùng INITIAL_ACCOUNT_PASSWORD."
        ),
    )
    args = parser.parse_args()

    affected_accounts = reset_demo_database(
        full=args.full,
        shared_demo_password=args.shared_demo_password,
    )
    if args.full:
        print(
            "Full demo reset complete: all business data, account customizations and "
            "Google connections cleared; canonical rooms, equipment, employees and "
            f"{affected_accounts} accounts restored."
        )
        return

    print(
        "Demo database reset: meetings, reminders and bookings cleared; "
        "rooms, equipment and employees restored; Sprint 3 accounts preserved"
        + (
            f" and {affected_accounts} passwords rotated."
            if args.shared_demo_password
            else "."
        )
    )


if __name__ == "__main__":
    main()
