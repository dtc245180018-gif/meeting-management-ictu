"""Add a small, repeatable dataset for presenting Sprint 1 and Sprint 2.

Run from the backend directory:

    python scripts/seed_demo_data.py

The script never removes user data and skips a demo meeting when its title
already exists, so it is safe to run more than once.
"""

from datetime import datetime, timedelta, timezone
from pathlib import Path
import sys


# Allow the script to be called directly from the backend directory.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select

from app import models
from app.database import Base, SessionLocal, engine
from app.main import apply_schema_migrations, seed_employees, seed_equipment, seed_rooms


DEMO_PREFIX = "[DEMO]"


def find_room(db, name: str) -> models.Room | None:
    return db.scalar(select(models.Room).where(models.Room.name == name))


def find_equipment(db, code: str) -> models.Equipment | None:
    return db.scalar(select(models.Equipment).where(models.Equipment.code == code))


def add_demo_meeting(
    db,
    *,
    title: str,
    organizer: str,
    participants: list[tuple[str, models.InvitationStatus]],
    start: datetime,
    duration_hours: int = 1,
    room_name: str | None = None,
    recurrence_count: int = 1,
    status: models.MeetingStatus = models.MeetingStatus.SCHEDULED,
    equipment_codes: list[str] | None = None,
    reminder_minutes: int | None = None,
) -> bool:
    if db.scalar(select(models.Meeting.id).where(models.Meeting.title == title)):
        return False

    room = find_room(db, room_name) if room_name else None
    equipment_items = [item for code in (equipment_codes or []) if (item := find_equipment(db, code))]
    recurrence_group = f"demo-{title.lower().replace(' ', '-')[:40]}" if recurrence_count > 1 else None
    participant_emails = [email for email, _ in participants]
    for occurrence in range(recurrence_count):
        occurrence_start = start + timedelta(weeks=occurrence)
        occurrence_end = occurrence_start + timedelta(hours=duration_hours)
        meeting = models.Meeting(
            title=title if occurrence == 0 else f"{title} · Lần {occurrence + 1}",
            description="Dữ liệu mẫu phục vụ trình diễn Sprint 1 và Sprint 2.",
            organizer_email=organizer,
            expected_attendees=len(set(participant_emails)) + 1,
            start_time=occurrence_start,
            end_time=occurrence_end,
            recurrence="weekly" if recurrence_count > 1 else None,
            recurrence_group=recurrence_group,
            status=status,
            participants=[models.Participant(email=email, status=participant_status) for email, participant_status in participants],
        )
        db.add(meeting)
        db.flush()
        if room and status == models.MeetingStatus.SCHEDULED:
            db.add(models.RoomBooking(
                room_id=room.id,
                meeting_id=meeting.id,
                start_time=occurrence_start,
                end_time=occurrence_end,
            ))
        if status == models.MeetingStatus.SCHEDULED:
            for equipment in equipment_items:
                db.add(models.EquipmentBooking(
                    equipment_id=equipment.id,
                    meeting_id=meeting.id,
                    start_time=occurrence_start,
                    end_time=occurrence_end,
                ))
        if reminder_minutes is not None:
            for recipient in sorted({organizer, *participant_emails}):
                db.add(models.Reminder(
                    meeting_id=meeting.id,
                    recipient_email=recipient,
                    channel="email",
                    remind_at=occurrence_start - timedelta(minutes=reminder_minutes),
                    status=(
                        models.NotificationStatus.CANCELLED
                        if status == models.MeetingStatus.CANCELLED
                        else models.NotificationStatus.PENDING
                    ),
                ))

    db.commit()
    return True


def main() -> None:
    Base.metadata.create_all(bind=engine)
    apply_schema_migrations()
    seed_rooms()
    seed_employees()
    seed_equipment()

    now = datetime.now(timezone.utc)
    first_day = (now + timedelta(days=2)).replace(hour=9, minute=0, second=0, microsecond=0)
    second_day = (now + timedelta(days=3)).replace(hour=14, minute=0, second=0, microsecond=0)
    third_day = (now + timedelta(days=4)).replace(hour=8, minute=30, second=0, microsecond=0)
    past_day = (now - timedelta(days=1)).replace(hour=10, minute=0, second=0, microsecond=0)

    with SessionLocal() as db:
        added = [
            add_demo_meeting(
                db,
                title=f"{DEMO_PREFIX} Họp kế hoạch Sprint 1",
                organizer="leader@ictu.edu.vn",
                participants=[
                    ("minhanh@ictu.edu.vn", models.InvitationStatus.ACCEPTED),
                    ("hoangnam@ictu.edu.vn", models.InvitationStatus.INVITED),
                ],
                start=first_day,
                room_name="Phòng A203",
                equipment_codes=["TB-MC-01", "TB-MIC-01"],
                reminder_minutes=30,
            ),
            add_demo_meeting(
                db,
                title=f"{DEMO_PREFIX} Nghiệm thu nội bộ",
                organizer="minhanh@ictu.edu.vn",
                participants=[
                    ("thuha@ictu.edu.vn", models.InvitationStatus.ACCEPTED),
                    ("quanghuy@ictu.edu.vn", models.InvitationStatus.DECLINED),
                ],
                start=second_day,
                duration_hours=2,
                room_name="Phòng B301",
                equipment_codes=["TB-TV-01"],
                reminder_minutes=60,
            ),
            add_demo_meeting(
                db,
                title=f"{DEMO_PREFIX} Họp chưa đặt phòng",
                organizer="thuha@ictu.edu.vn",
                participants=[("mailinh@ictu.edu.vn", models.InvitationStatus.INVITED)],
                start=third_day,
                reminder_minutes=15,
            ),
            add_demo_meeting(
                db,
                title=f"{DEMO_PREFIX} Lịch họp định kỳ",
                organizer="leader@ictu.edu.vn",
                participants=[
                    ("quanghuy@ictu.edu.vn", models.InvitationStatus.INVITED),
                    ("mailinh@ictu.edu.vn", models.InvitationStatus.ACCEPTED),
                ],
                start=first_day + timedelta(days=1),
                room_name="Phòng D201",
                recurrence_count=2,
                equipment_codes=["TB-MC-02"],
                reminder_minutes=1440,
            ),
            add_demo_meeting(
                db,
                title=f"{DEMO_PREFIX} Cuộc họp đã hủy",
                organizer="leader@ictu.edu.vn",
                participants=[("thuha@ictu.edu.vn", models.InvitationStatus.INVITED)],
                start=past_day,
                status=models.MeetingStatus.CANCELLED,
                reminder_minutes=30,
            ),
        ]

    print(f"Demo data groups added: {sum(added)}; existing groups were skipped.")


if __name__ == "__main__":
    main()
