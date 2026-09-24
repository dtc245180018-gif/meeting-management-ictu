from datetime import datetime

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models, schemas, services
from .database import get_db


router = APIRouter(prefix="/api")


@router.get("/health")
def health():
    return {"status": "ok"}


@router.post("/meetings", response_model=list[schemas.MeetingOut], status_code=status.HTTP_201_CREATED)
def create_meeting(payload: schemas.MeetingCreate, db: Session = Depends(get_db)):
    return services.create_meetings(db, payload)


@router.get("/meetings", response_model=list[schemas.MeetingOut])
def list_meetings(db: Session = Depends(get_db)):
    stmt = services.meeting_query().order_by(models.Meeting.start_time)
    return list(db.scalars(stmt).unique().all())


@router.get("/meetings/history", response_model=list[schemas.MeetingOut])
def meeting_history(email: str = Query(min_length=3), db: Session = Depends(get_db)):
    return services.list_history(db, email)


@router.post("/meetings/suggest-times", response_model=list[schemas.SuggestedTimeOut])
def suggest_meeting_times(payload: schemas.SuggestedTimeRequest, db: Session = Depends(get_db)):
    return services.suggest_times(db, payload)


@router.get("/meetings/{meeting_id}", response_model=schemas.MeetingOut)
def meeting_detail(meeting_id: int, db: Session = Depends(get_db)):
    return services.get_meeting_or_404(db, meeting_id)


@router.patch("/meetings/{meeting_id}", response_model=schemas.MeetingOut)
def edit_meeting(meeting_id: int, payload: schemas.MeetingUpdate, db: Session = Depends(get_db)):
    return services.update_meeting(db, meeting_id, payload)


@router.post("/meetings/{meeting_id}/cancel", response_model=schemas.MeetingOut)
def cancel_meeting(meeting_id: int, payload: schemas.CancelRequest, db: Session = Depends(get_db)):
    return services.cancel_meeting(db, meeting_id, str(payload.requester_email))


@router.get("/rooms", response_model=list[schemas.RoomOut])
def list_rooms(db: Session = Depends(get_db)):
    return list(db.scalars(select(models.Room).where(models.Room.is_active.is_(True)).order_by(models.Room.capacity)).all())


@router.get("/employees", response_model=list[schemas.EmployeeOut])
def list_employees(db: Session = Depends(get_db)):
    return list(
        db.scalars(
            select(models.Employee)
            .where(models.Employee.is_active.is_(True))
            .order_by(models.Employee.full_name)
        ).all()
    )


@router.get("/rooms/available", response_model=list[schemas.RoomOut])
def list_available_rooms(
    start_time: datetime,
    end_time: datetime,
    min_capacity: int = Query(default=1, ge=1),
    db: Session = Depends(get_db),
):
    return services.available_rooms(db, start_time, end_time, min_capacity)


@router.post("/rooms/bookings", response_model=schemas.BookingOut, status_code=status.HTTP_201_CREATED)
def book_room(payload: schemas.BookingCreate, db: Session = Depends(get_db)):
    return services.create_booking(db, payload)
