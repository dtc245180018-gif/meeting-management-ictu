import asyncio
import csv
from contextlib import asynccontextmanager, suppress
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, select, text

from . import models, reminders
from .api import router
from .config import get_settings
from .database import Base, SessionLocal, engine
from .passwords import generate_temporary_password, hash_password


LEGACY_EMAIL_GROUPS = (
    ("leader@ictu.edu.vn", "leader@example.com"),
    ("minhanh@ictu.edu.vn", "employee.one@example.com"),
    ("hoangnam@ictu.edu.vn", "employee.two@example.com"),
)


def configured_user_emails() -> tuple[str, str, str]:
    settings = get_settings()
    return (
        settings.leader_email.strip().lower(),
        settings.employee_one_email.strip().lower(),
        settings.employee_two_email.strip().lower(),
    )


def migrate_employee_emails() -> None:
    """Replace every previous sample address in persisted references.

    Both the original ICTU aliases and the later ``example.com`` defaults may
    exist in a database that is upgraded to configured real accounts.
    """
    replacements = {
        old_email: new_email
        for old_emails, new_email in zip(
            LEGACY_EMAIL_GROUPS, configured_user_emails(), strict=True
        )
        for old_email in old_emails
        if old_email != new_email
    }
    with SessionLocal() as db:
        for old_email, new_email in replacements.items():
            for meeting in db.scalars(
                select(models.Meeting).where(models.Meeting.organizer_email == old_email)
            ).all():
                meeting.organizer_email = new_email

            for participant in list(
                db.scalars(select(models.Participant).where(models.Participant.email == old_email)).all()
            ):
                duplicate = db.scalar(
                    select(models.Participant).where(
                        models.Participant.meeting_id == participant.meeting_id,
                        models.Participant.email == new_email,
                    )
                )
                if duplicate and duplicate.id != participant.id:
                    if participant.status == models.InvitationStatus.ACCEPTED:
                        duplicate.status = participant.status
                    db.delete(participant)
                else:
                    participant.email = new_email

            for reminder in list(
                db.scalars(select(models.Reminder).where(models.Reminder.recipient_email == old_email)).all()
            ):
                duplicate = db.scalar(
                    select(models.Reminder).where(
                        models.Reminder.meeting_id == reminder.meeting_id,
                        models.Reminder.recipient_email == new_email,
                        models.Reminder.remind_at == reminder.remind_at,
                    )
                )
                if duplicate and duplicate.id != reminder.id:
                    duplicate.is_read = duplicate.is_read or reminder.is_read
                    db.delete(reminder)
                else:
                    reminder.recipient_email = new_email

            old_employee = db.scalar(select(models.Employee).where(models.Employee.email == old_email))
            new_employee = db.scalar(select(models.Employee).where(models.Employee.email == new_email))
            old_account = db.scalar(
                select(models.UserAccount).where(models.UserAccount.email == old_email)
            )
            new_account = db.scalar(
                select(models.UserAccount).where(models.UserAccount.email == new_email)
            )
            if old_employee and new_employee and old_employee.id != new_employee.id:
                if old_account and not new_account:
                    old_account.employee = new_employee
                    old_account.email = new_email
                elif old_account:
                    db.delete(old_account)
                db.delete(old_employee)
            elif old_employee:
                old_employee.email = new_email
                if old_account:
                    old_account.email = new_email
            elif old_account and not new_account:
                old_account.email = new_email
        db.commit()


def seed_rooms() -> None:
    with SessionLocal() as db:
        rooms = [
            models.Room(name="Phòng A101", capacity=6, location="Tầng 1 - Khu A", building="Khu A", floor=1, room_type="Phòng họp nhỏ", display=True, microphone=True),
            models.Room(name="Phòng A203", capacity=12, location="Tầng 2 - Khu A", building="Khu A", floor=2, room_type="Phòng họp", projector=True, display=True, microphone=True, video_conferencing=True),
            models.Room(name="Phòng A205", capacity=8, location="Tầng 2 - Khu A", building="Khu A", floor=2, room_type="Phòng họp nhóm", display=True, microphone=True),
            models.Room(name="Phòng A302", capacity=16, location="Tầng 3 - Khu A", building="Khu A", floor=3, room_type="Phòng họp", projector=True, display=True, microphone=True),
            models.Room(name="Phòng B201", capacity=10, location="Tầng 2 - Khu B", building="Khu B", floor=2, room_type="Phòng họp nhóm", display=True, microphone=True),
            models.Room(name="Phòng B301", capacity=20, location="Tầng 3 - Khu B", building="Khu B", floor=3, room_type="Phòng họp lớn", projector=True, display=True, microphone=True, video_conferencing=True),
            models.Room(name="Phòng B305", capacity=30, location="Tầng 3 - Khu B", building="Khu B", floor=3, room_type="Phòng họp lớn", projector=True, display=True, microphone=True, video_conferencing=True),
            models.Room(name="Hội trường C", capacity=80, location="Tầng 1 - Khu C", building="Khu C", floor=1, room_type="Hội trường", projector=True, display=True, microphone=True, video_conferencing=True),
            models.Room(name="Phòng D201", capacity=24, location="Tầng 2 - Khu D", building="Khu D", floor=2, room_type="Phòng họp lớn", projector=True, display=True, microphone=True, video_conferencing=True),
            models.Room(name="Phòng D303", capacity=40, location="Tầng 3 - Khu D", building="Khu D", floor=3, room_type="Phòng họp lớn", projector=True, display=True, microphone=True, video_conferencing=True),
        ]
        existing_names = set(db.scalars(select(models.Room.name)).all())
        new_rooms = [room for room in rooms if room.name not in existing_names]
        if new_rooms:
            db.add_all(new_rooms)
            db.commit()


def seed_employees() -> None:
    leader_email, employee_one_email, employee_two_email = configured_user_emails()
    with SessionLocal() as db:
        employees = [
            models.Employee(full_name="Nguyễn Ngọc Thắng", email=leader_email, department="Nhóm dự án ICTU"),
            models.Employee(full_name="Trần Minh Anh", email=employee_one_email, department="Khoa Công nghệ thông tin"),
            models.Employee(full_name="Lê Hoàng Nam", email=employee_two_email, department="Phòng Đào tạo"),
            models.Employee(full_name="Phạm Thu Hà", email="thuha@ictu.edu.vn", department="Phòng Hành chính"),
            models.Employee(full_name="Đỗ Quang Huy", email="quanghuy@ictu.edu.vn", department="Trung tâm CNTT"),
            models.Employee(full_name="Vũ Mai Linh", email="mailinh@ictu.edu.vn", department="Khoa Hệ thống thông tin"),
            models.Employee(full_name="Nguyễn Thu Trang", email="trangnt@ictu.edu.vn", department="Khoa Truyền thông đa phương tiện"),
            models.Employee(full_name="Bùi Đức Long", email="longbd@ictu.edu.vn", department="Khoa Kỹ thuật và Công nghệ"),
            models.Employee(full_name="Hoàng Lan Phương", email="phuonghl@ictu.edu.vn", department="Phòng Khoa học Công nghệ"),
            models.Employee(full_name="Trịnh Quốc Việt", email="viettq@ictu.edu.vn", department="Phòng Khảo thí và Đảm bảo chất lượng"),
        ]
        existing_emails = set(db.scalars(select(models.Employee.email)).all())
        new_employees = [employee for employee in employees if employee.email not in existing_emails]
        if new_employees:
            db.add_all(new_employees)
            db.commit()


def _write_sprint3_credentials(path: Path, credentials: list[dict[str, str]]) -> None:
    """Merge generated credentials into a local, Git-ignored CSV file."""
    fieldnames = [
        "full_name",
        "email",
        "temporary_password",
        "role",
        "must_change_password",
    ]
    existing: dict[str, dict[str, str]] = {}
    if path.exists():
        with path.open("r", encoding="utf-8-sig", newline="") as source:
            for row in csv.DictReader(source):
                email = (row.get("email") or "").strip().lower()
                if email:
                    existing[email] = {field: row.get(field, "") for field in fieldnames}

    for credential in credentials:
        existing[credential["email"]] = credential

    path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = path.with_suffix(f"{path.suffix}.tmp")
    with temporary_path.open("w", encoding="utf-8-sig", newline="") as target:
        writer = csv.DictWriter(target, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(
            sorted(
                existing.values(),
                key=lambda row: (row["role"] != models.AccountRole.ADMIN.value, row["full_name"]),
            )
        )
    temporary_path.replace(path)


def seed_user_accounts() -> int:
    """Create one password-hashed Sprint 3 account for every active employee."""
    settings = get_settings()
    if not settings.sprint3_seed_accounts:
        return 0

    admin_emails = settings.admin_email_list | {settings.leader_email.strip().lower()}
    credentials: list[dict[str, str]] = []
    created_accounts: list[models.UserAccount] = []

    with SessionLocal() as db:
        employees = db.scalars(
            select(models.Employee)
            .where(models.Employee.is_active.is_(True))
            .order_by(models.Employee.id)
        ).all()
        accounts_by_employee = {
            account.employee_id: account
            for account in db.scalars(select(models.UserAccount)).all()
        }

        for employee in employees:
            email = employee.email.strip().lower()
            role = (
                models.AccountRole.ADMIN
                if email in admin_emails
                else models.AccountRole.EMPLOYEE
            )
            existing = accounts_by_employee.get(employee.id)
            if existing:
                existing.email = email
                existing.role = role
                existing.is_active = employee.is_active
                continue

            temporary_password = generate_temporary_password()
            account = models.UserAccount(
                employee=employee,
                email=email,
                password_hash=hash_password(temporary_password),
                role=role,
                must_change_password=True,
                is_active=True,
            )
            db.add(account)
            created_accounts.append(account)
            credentials.append(
                {
                    "full_name": employee.full_name,
                    "email": email,
                    "temporary_password": temporary_password,
                    "role": role.value,
                    "must_change_password": "true",
                }
            )

        db.commit()

        if credentials:
            credentials_path = Path(settings.sprint3_credentials_file).expanduser()
            try:
                _write_sprint3_credentials(credentials_path, credentials)
            except Exception:
                for account in created_accounts:
                    db.delete(account)
                db.commit()
                raise

    return len(created_accounts)


def set_shared_sprint3_demo_password(password: str) -> int:
    """Rotate every prepared account to one local-only demo password.

    This helper exists for supervised Sprint 3 demos. Production deployments
    must use unique passwords or an identity provider instead.
    """
    if not password:
        raise ValueError("Demo password must not be empty")

    settings = get_settings()
    original_hashes: dict[int, str] = {}
    credentials: list[dict[str, str]] = []

    with SessionLocal() as db:
        accounts = db.scalars(
            select(models.UserAccount).order_by(models.UserAccount.id)
        ).all()
        for account in accounts:
            original_hashes[account.id] = account.password_hash
            account.password_hash = hash_password(password)
            account.must_change_password = True
            credentials.append(
                {
                    "full_name": account.employee.full_name,
                    "email": account.email,
                    "temporary_password": password,
                    "role": account.role.value,
                    "must_change_password": "true",
                }
            )
        db.commit()

        try:
            _write_sprint3_credentials(
                Path(settings.sprint3_credentials_file).expanduser(), credentials
            )
        except Exception:
            for account in accounts:
                account.password_hash = original_hashes[account.id]
            db.commit()
            raise

    return len(accounts)


def seed_equipment() -> None:
    with SessionLocal() as db:
        equipment_items = [
            models.Equipment(code="TB-MC-01", name="Máy chiếu Epson 01", category="projector", location="Phòng thiết bị"),
            models.Equipment(code="TB-MC-02", name="Máy chiếu Epson 02", category="projector", location="Phòng thiết bị"),
            models.Equipment(code="TB-TV-01", name="Màn hình Samsung 65 inch", category="display", location="Phòng thiết bị"),
            models.Equipment(code="TB-BT-01", name="Bảng trắng di động", category="whiteboard", location="Phòng thiết bị"),
            models.Equipment(code="TB-MIC-01", name="Bộ micro không dây", category="microphone", location="Phòng thiết bị"),
            models.Equipment(
                code="TB-VC-01",
                name="Bộ họp trực tuyến",
                category="video_conference",
                location="Phòng thiết bị",
                status=models.EquipmentStatus.MAINTENANCE,
            ),
        ]
        existing_codes = set(db.scalars(select(models.Equipment.code)).all())
        additions = [item for item in equipment_items if item.code not in existing_codes]
        if additions:
            db.add_all(additions)
            db.commit()


async def reminder_worker() -> None:
    while True:
        await asyncio.to_thread(reminders.process_due_reminders_task)
        await asyncio.sleep(30)


def apply_schema_migrations() -> None:
    """Apply the forward-only schema changes used by the Sprint 1 app."""
    inspector = inspect(engine)
    with engine.begin() as connection:
        meeting_columns = {column["name"] for column in inspector.get_columns("meetings")}
        if "expected_attendees" not in meeting_columns:
            connection.execute(text("ALTER TABLE meetings ADD COLUMN expected_attendees INTEGER NOT NULL DEFAULT 1"))
            connection.execute(text("UPDATE meetings SET expected_attendees = 1 + (SELECT COUNT(*) FROM participants WHERE participants.meeting_id = meetings.id)"))

        room_columns = {column["name"] for column in inspector.get_columns("rooms")}
        additions = {
            "building": "VARCHAR(120) NOT NULL DEFAULT ''",
            "floor": "INTEGER NOT NULL DEFAULT 1",
            "room_type": "VARCHAR(80) NOT NULL DEFAULT 'Phòng họp'",
            "projector": "BOOLEAN NOT NULL DEFAULT FALSE",
            "display": "BOOLEAN NOT NULL DEFAULT FALSE",
            "microphone": "BOOLEAN NOT NULL DEFAULT FALSE",
            "video_conferencing": "BOOLEAN NOT NULL DEFAULT FALSE",
        }
        for name, definition in additions.items():
            if name not in room_columns:
                connection.execute(text(f"ALTER TABLE rooms ADD COLUMN {name} {definition}"))

        reminder_columns = {column["name"] for column in inspector.get_columns("reminders")}
        reminder_additions = {
            "kind": "VARCHAR(32) NOT NULL DEFAULT 'REMINDER'",
            "subject": "VARCHAR(300)",
            "body": "TEXT",
            "event_key": "VARCHAR(255)",
        }
        for name, definition in reminder_additions.items():
            if name not in reminder_columns:
                connection.execute(text(f"ALTER TABLE reminders ADD COLUMN {name} {definition}"))
        connection.execute(
            text("CREATE UNIQUE INDEX IF NOT EXISTS ix_reminders_event_key ON reminders (event_key)")
        )


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    apply_schema_migrations()
    migrate_employee_emails()
    seed_rooms()
    seed_employees()
    seed_user_accounts()
    seed_equipment()
    reminders.backfill_meeting_starting_notifications()
    worker = asyncio.create_task(reminder_worker())
    try:
        yield
    finally:
        worker.cancel()
        with suppress(asyncio.CancelledError):
            await worker


settings = get_settings()
app = FastAPI(title=settings.app_name, version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(router)


@app.get("/")
def root():
    return {"message": "Meeting Management ICTU API", "docs": "/docs"}
