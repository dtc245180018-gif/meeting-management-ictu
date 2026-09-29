import asyncio
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, select, text

from . import models, reminders
from .api import router
from .config import get_settings
from .database import Base, SessionLocal, engine


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
    with SessionLocal() as db:
        employees = [
            models.Employee(full_name="Nguyễn Ngọc Thắng", email="leader@ictu.edu.vn", department="Nhóm dự án ICTU"),
            models.Employee(full_name="Trần Minh Anh", email="minhanh@ictu.edu.vn", department="Khoa Công nghệ thông tin"),
            models.Employee(full_name="Lê Hoàng Nam", email="hoangnam@ictu.edu.vn", department="Phòng Đào tạo"),
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


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    apply_schema_migrations()
    seed_rooms()
    seed_employees()
    seed_equipment()
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
