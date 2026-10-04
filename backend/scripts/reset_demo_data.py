"""Reset the local database to a clean state for a manual demo.

This removes meetings, invitations, reminders and resource bookings, then
restores the canonical ICTU room, equipment and employee directory. It does not add
sample meetings; the presenter creates them during the demo.

Run from the backend directory:

    python scripts/reset_demo_data.py
"""

from pathlib import Path
import sys


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import delete

from app import models
from app.database import Base, SessionLocal, engine
from app.main import (
    apply_schema_migrations,
    migrate_employee_emails,
    seed_employees,
    seed_equipment,
    seed_rooms,
    seed_user_accounts,
)


def main() -> None:
    Base.metadata.create_all(bind=engine)
    apply_schema_migrations()
    migrate_employee_emails()

    with SessionLocal() as db:
        db.execute(delete(models.Reminder))
        db.execute(delete(models.EquipmentBooking))
        db.execute(delete(models.RoomBooking))
        db.execute(delete(models.Participant))
        db.execute(delete(models.Meeting))
        db.execute(delete(models.Room))
        db.execute(delete(models.Equipment))
        db.commit()

    seed_rooms()
    seed_employees()
    seed_user_accounts()
    seed_equipment()
    print(
        "Demo database reset: meetings, reminders and bookings cleared; "
        "rooms, equipment and employees restored; Sprint 3 accounts preserved."
    )


if __name__ == "__main__":
    main()
