from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from . import models
from .api import router
from .config import get_settings
from .database import Base, SessionLocal, engine


def seed_rooms() -> None:
    with SessionLocal() as db:
        if db.scalar(select(models.Room.id).limit(1)):
            return
        db.add_all(
            [
                models.Room(name="Phòng A101", capacity=6, location="Tầng 1 - Khu A"),
                models.Room(name="Phòng A203", capacity=12, location="Tầng 2 - Khu A"),
                models.Room(name="Phòng B301", capacity=20, location="Tầng 3 - Khu B"),
                models.Room(name="Hội trường C", capacity=80, location="Tầng 1 - Khu C"),
            ]
        )
        db.commit()


def seed_employees() -> None:
    with SessionLocal() as db:
        if db.scalar(select(models.Employee.id).limit(1)):
            return
        db.add_all(
            [
                models.Employee(full_name="Nguyễn Ngọc Thắng", email="leader@ictu.edu.vn", department="Nhóm dự án ICTU"),
                models.Employee(full_name="Trần Minh Anh", email="minhanh@ictu.edu.vn", department="Khoa Công nghệ thông tin"),
                models.Employee(full_name="Lê Hoàng Nam", email="hoangnam@ictu.edu.vn", department="Phòng Đào tạo"),
                models.Employee(full_name="Phạm Thu Hà", email="thuha@ictu.edu.vn", department="Phòng Hành chính"),
                models.Employee(full_name="Đỗ Quang Huy", email="quanghuy@ictu.edu.vn", department="Trung tâm CNTT"),
                models.Employee(full_name="Vũ Mai Linh", email="mailinh@ictu.edu.vn", department="Khoa Hệ thống thông tin"),
            ]
        )
        db.commit()


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    seed_rooms()
    seed_employees()
    yield


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
