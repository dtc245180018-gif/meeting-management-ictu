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


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    seed_rooms()
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

