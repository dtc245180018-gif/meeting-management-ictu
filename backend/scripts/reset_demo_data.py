"""Reset the local database to a clean state for a manual demo.

This removes meetings, invitations and room bookings, then restores the
canonical ICTU room and employee directory. It intentionally does not add
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
from app.main import apply_schema_migrations, seed_employees, seed_rooms


def main() -> None:
    Base.metadata.create_all(bind=engine)
    apply_schema_migrations()

    with SessionLocal() as db:
        db.execute(delete(models.RoomBooking))
        db.execute(delete(models.Participant))
        db.execute(delete(models.Meeting))
        db.execute(delete(models.Room))
        db.execute(delete(models.Employee))
        db.commit()

    seed_rooms()
    seed_employees()
    print("Demo database reset: meetings, invitations and bookings cleared; rooms and employees restored.")


if __name__ == "__main__":
    main()
