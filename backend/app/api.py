from datetime import datetime

from typing import Literal
from urllib.parse import urlencode

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Response, status
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import google_calendar, models, reminders, schemas, services
from .calendar_integration import calendar_provider
from .config import get_settings
from .database import get_db


router = APIRouter(prefix="/api")


@router.get("/health")
def health():
    return {"status": "ok"}


@router.post("/meetings", response_model=list[schemas.MeetingOut], status_code=status.HTTP_201_CREATED)
def create_meeting(payload: schemas.MeetingCreate, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    result = services.create_meetings(db, payload)
    background_tasks.add_task(reminders.process_due_reminders_task)
    for meeting in result:
        background_tasks.add_task(google_calendar.sync_meeting_if_connected_task, meeting.id)
    return result


@router.get("/meetings", response_model=list[schemas.MeetingOut])
def list_meetings(db: Session = Depends(get_db)):
    stmt = services.meeting_query().order_by(models.Meeting.start_time)
    return list(db.scalars(stmt).unique().all())


@router.get("/meetings/history", response_model=list[schemas.MeetingOut])
def meeting_history(
    email: str = Query(min_length=3),
    status_filter: models.MeetingStatus | None = Query(default=None, alias="status"),
    date_from: datetime | None = Query(default=None),
    date_to: datetime | None = Query(default=None),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=100),
    db: Session = Depends(get_db),
):
    if date_from and date_to and date_to < date_from:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Khoảng thời gian không hợp lệ")
    return services.list_history(db, email, status_filter, date_from, date_to, offset, limit)


@router.post("/meetings/suggest-times", response_model=list[schemas.SuggestedTimeOut])
def suggest_meeting_times(payload: schemas.SuggestedTimeRequest, db: Session = Depends(get_db)):
    return services.suggest_times(db, payload)


@router.get("/meetings/{meeting_id}", response_model=schemas.MeetingOut)
def meeting_detail(meeting_id: int, db: Session = Depends(get_db)):
    return services.get_meeting_or_404(db, meeting_id)


@router.patch("/meetings/{meeting_id}", response_model=schemas.MeetingOut)
def edit_meeting(
    meeting_id: int,
    payload: schemas.MeetingUpdate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    result = services.update_meeting(db, meeting_id, payload)
    background_tasks.add_task(reminders.process_due_reminders_task)
    background_tasks.add_task(google_calendar.sync_meeting_if_connected_task, meeting_id)
    return result


@router.post("/meetings/{meeting_id}/cancel", response_model=schemas.MeetingOut)
def cancel_meeting(
    meeting_id: int,
    payload: schemas.CancelRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    result = services.cancel_meeting(db, meeting_id, str(payload.requester_email))
    background_tasks.add_task(reminders.process_due_reminders_task)
    background_tasks.add_task(google_calendar.sync_meeting_if_connected_task, meeting_id)
    return result


@router.post("/meetings/{meeting_id}/invitations/respond", response_model=schemas.MeetingOut)
def respond_to_invitation(
    meeting_id: int,
    payload: schemas.InvitationResponseRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    result = services.respond_to_invitation(
        db,
        meeting_id,
        str(payload.email),
        models.InvitationStatus(payload.status),
    )
    background_tasks.add_task(reminders.process_due_reminders_task)
    return result


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


@router.get("/admin/rooms", response_model=list[schemas.RoomOut])
def admin_list_rooms(requester_email: str, db: Session = Depends(get_db)):
    return services.list_admin_rooms(db, requester_email)


@router.post("/admin/rooms", response_model=schemas.RoomOut, status_code=status.HTTP_201_CREATED)
def admin_create_room(payload: schemas.RoomAdminCreate, db: Session = Depends(get_db)):
    return services.create_admin_room(db, payload)


@router.patch("/admin/rooms/{room_id}", response_model=schemas.RoomOut)
def admin_update_room(room_id: int, payload: schemas.RoomAdminUpdate, db: Session = Depends(get_db)):
    return services.update_admin_room(db, room_id, payload)


@router.delete("/admin/rooms/{room_id}", response_model=schemas.RoomOut)
def admin_deactivate_room(room_id: int, requester_email: str, db: Session = Depends(get_db)):
    return services.deactivate_admin_room(db, room_id, requester_email)


@router.get("/equipment", response_model=list[schemas.EquipmentOut])
def equipment_directory(
    start_time: datetime | None = None,
    end_time: datetime | None = None,
    category: str | None = None,
    status_filter: Literal["available", "booked", "maintenance", "inactive"] | None = Query(default=None, alias="status"),
    db: Session = Depends(get_db),
):
    return services.list_equipment(db, start_time, end_time, category, status_filter)


@router.get("/equipment/available", response_model=list[schemas.EquipmentOut])
def available_equipment(
    start_time: datetime,
    end_time: datetime,
    category: str | None = None,
    db: Session = Depends(get_db),
):
    return services.list_equipment(db, start_time, end_time, category, "available", include_inactive=False)


@router.get("/admin/equipment", response_model=list[schemas.EquipmentOut])
def admin_list_equipment(requester_email: str, db: Session = Depends(get_db)):
    services.require_admin(requester_email)
    return services.list_equipment(db)


@router.post("/admin/equipment", response_model=schemas.EquipmentOut, status_code=status.HTTP_201_CREATED)
def admin_create_equipment(payload: schemas.EquipmentAdminCreate, db: Session = Depends(get_db)):
    return services.create_admin_equipment(db, payload)


@router.patch("/admin/equipment/{equipment_id}", response_model=schemas.EquipmentOut)
def admin_update_equipment(
    equipment_id: int,
    payload: schemas.EquipmentAdminUpdate,
    db: Session = Depends(get_db),
):
    return services.update_admin_equipment(db, equipment_id, payload)


@router.delete("/admin/equipment/{equipment_id}", response_model=schemas.EquipmentOut)
def admin_deactivate_equipment(equipment_id: int, requester_email: str, db: Session = Depends(get_db)):
    return services.deactivate_admin_equipment(db, equipment_id, requester_email)


@router.get("/meetings/{meeting_id}/calendar.ics")
def meeting_calendar_file(meeting_id: int, db: Session = Depends(get_db)):
    meeting = services.get_meeting_or_404(db, meeting_id)
    return Response(
        content=calendar_provider.ics(meeting),
        media_type="text/calendar; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="meeting-{meeting.id}.ics"'},
    )


@router.get("/meetings/{meeting_id}/calendar-links", response_model=schemas.CalendarLinksOut)
def meeting_calendar_links(meeting_id: int, db: Session = Depends(get_db)):
    meeting = services.get_meeting_or_404(db, meeting_id)
    return schemas.CalendarLinksOut(
        google_url=calendar_provider.google_url(meeting),
        outlook_ics_url=f"/api/meetings/{meeting.id}/calendar.ics",
    )


@router.get("/integrations/google/status", response_model=schemas.GoogleConnectionStatusOut)
def google_connection_status(email: str = Query(min_length=3), db: Session = Depends(get_db)):
    return google_calendar.connection_status(db, email)


@router.get("/integrations/email/status", response_model=schemas.EmailIntegrationStatusOut)
def email_connection_status():
    return reminders.email_integration_status()


@router.get("/integrations/google/connect", response_model=schemas.GoogleConnectUrlOut)
def google_connect(email: str = Query(min_length=3)):
    return schemas.GoogleConnectUrlOut(authorization_url=google_calendar.authorization_url(email))


@router.get("/integrations/google/callback")
def google_callback(
    code: str | None = None,
    state_value: str | None = Query(default=None, alias="state"),
    error: str | None = None,
    db: Session = Depends(get_db),
):
    if error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Google OAuth: {error}")
    if not code or not state_value:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Thiếu mã xác thực Google")
    connection = google_calendar.complete_oauth(db, code, state_value)
    query = urlencode({"google_calendar": "connected", "email": connection.user_email})
    return RedirectResponse(f"{get_settings().frontend_url.rstrip('/')}?{query}", status_code=status.HTTP_303_SEE_OTHER)


@router.delete("/integrations/google", response_model=schemas.MessageOut)
def google_disconnect(email: str = Query(min_length=3), db: Session = Depends(get_db)):
    google_calendar.disconnect(db, email)
    return schemas.MessageOut(message="Đã ngắt kết nối Google Calendar")


@router.post(
    "/meetings/{meeting_id}/google-calendar/sync",
    response_model=schemas.GoogleCalendarEventOut,
)
def sync_google_calendar(
    meeting_id: int,
    payload: schemas.GoogleSyncRequest,
    db: Session = Depends(get_db),
):
    meeting = services.get_meeting_or_404(db, meeting_id)
    return google_calendar.sync_meeting(db, meeting, str(payload.requester_email))


@router.get("/notifications", response_model=list[schemas.NotificationOut])
def notifications(email: str = Query(min_length=3), db: Session = Depends(get_db)):
    return services.list_notifications(db, email)


@router.post("/notifications/{notification_id}/read", response_model=schemas.NotificationOut)
def read_notification(
    notification_id: int,
    payload: schemas.NotificationReadRequest,
    db: Session = Depends(get_db),
):
    return services.mark_notification_read(db, notification_id, str(payload.email))
