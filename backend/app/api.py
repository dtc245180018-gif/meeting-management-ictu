from datetime import datetime, timedelta, timezone

from typing import Literal
from urllib.parse import urlencode

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Response, status
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import account_services, auth, google_calendar, models, reminders, report_services, schemas, services
from .calendar_integration import calendar_provider
from .config import get_settings
from .database import get_db


router = APIRouter(prefix="/api")


def _identity(account: models.UserAccount | None, fallback: str) -> str:
    return account.email if account is not None else fallback.strip().lower()


def _can_view_meeting(account: models.UserAccount | None, meeting: models.Meeting) -> None:
    if account is None or account.role == models.AccountRole.ADMIN:
        return
    if meeting.organizer_email == account.email or any(item.email == account.email for item in meeting.participants):
        return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bạn không có quyền xem cuộc họp này")


@router.get("/health")
def health():
    return {"status": "ok"}


@router.post("/auth/login", response_model=schemas.LoginOut)
def login(payload: schemas.LoginRequest, db: Session = Depends(get_db)):
    account = account_services.authenticate(db, str(payload.email), payload.password)
    return schemas.LoginOut(
        access_token=auth.create_access_token(account),
        user=account_services.account_to_out(account),
    )


@router.get("/auth/me", response_model=schemas.AccountOut)
def current_user(account: models.UserAccount = Depends(auth.require_account)):
    return account_services.account_to_out(account)


@router.post("/auth/logout", response_model=schemas.MessageOut)
def logout(
    account: models.UserAccount = Depends(auth.require_account),
    db: Session = Depends(get_db),
):
    account_services.revoke_tokens(db, account)
    return schemas.MessageOut(message="Đã đăng xuất")


@router.post("/auth/change-password", response_model=schemas.MessageOut)
def change_password(
    payload: schemas.ChangePasswordRequest,
    account: models.UserAccount = Depends(auth.require_account),
    db: Session = Depends(get_db),
):
    account_services.change_password(db, account, payload.current_password, payload.new_password)
    return schemas.MessageOut(message="Đã đổi mật khẩu. Vui lòng đăng nhập lại")


@router.post("/meetings", response_model=list[schemas.MeetingOut], status_code=status.HTTP_201_CREATED)
def create_meeting(
    payload: schemas.MeetingCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    account: models.UserAccount | None = Depends(auth.get_current_account),
):
    if account is not None:
        auth.require_role(account, {models.AccountRole.ADMIN, models.AccountRole.ORGANIZER})
    result = services.create_meetings(
        db,
        payload,
        account_id=account.id if account else None,
        organizer_email=account.email if account else None,
    )
    background_tasks.add_task(reminders.process_due_reminders_task)
    for meeting in result:
        background_tasks.add_task(google_calendar.sync_meeting_if_connected_task, meeting.id)
    return result


@router.get("/meetings", response_model=list[schemas.MeetingOut])
def list_meetings(
    db: Session = Depends(get_db),
    account: models.UserAccount | None = Depends(auth.get_current_account),
):
    if account is not None and account.role != models.AccountRole.ADMIN:
        return services.list_history(db, account.email, limit=100)
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
    account: models.UserAccount | None = Depends(auth.get_current_account),
):
    if date_from and date_to and date_to < date_from:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Khoảng thời gian không hợp lệ")
    target_email = email
    if account is not None and account.role != models.AccountRole.ADMIN:
        target_email = account.email
    return services.list_history(db, target_email, status_filter, date_from, date_to, offset, limit)


@router.post("/meetings/suggest-times", response_model=list[schemas.SuggestedTimeOut])
def suggest_meeting_times(
    payload: schemas.SuggestedTimeRequest,
    db: Session = Depends(get_db),
    account: models.UserAccount | None = Depends(auth.get_current_account),
):
    if account is not None:
        auth.require_role(account, {models.AccountRole.ADMIN, models.AccountRole.ORGANIZER})
    return services.suggest_times(db, payload)


@router.get("/meetings/{meeting_id}", response_model=schemas.MeetingOut)
def meeting_detail(
    meeting_id: int,
    db: Session = Depends(get_db),
    account: models.UserAccount | None = Depends(auth.get_current_account),
):
    meeting = services.get_meeting_or_404(db, meeting_id)
    _can_view_meeting(account, meeting)
    return meeting


@router.patch("/meetings/{meeting_id}", response_model=schemas.MeetingOut)
def edit_meeting(
    meeting_id: int,
    payload: schemas.MeetingUpdate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    account: models.UserAccount | None = Depends(auth.get_current_account),
):
    requester_email = account.email if account else None
    if account is not None and account.role == models.AccountRole.ADMIN:
        requester_email = services.get_meeting_or_404(db, meeting_id).organizer_email
    result = services.update_meeting(
        db, meeting_id, payload, requester_email=requester_email
    )
    background_tasks.add_task(reminders.process_due_reminders_task)
    background_tasks.add_task(google_calendar.sync_meeting_if_connected_task, meeting_id)
    return result


@router.post("/meetings/{meeting_id}/cancel", response_model=schemas.MeetingOut)
def cancel_meeting(
    meeting_id: int,
    payload: schemas.CancelRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    account: models.UserAccount | None = Depends(auth.get_current_account),
):
    requester_email = _identity(account, str(payload.requester_email))
    if account is not None and account.role == models.AccountRole.ADMIN:
        requester_email = services.get_meeting_or_404(db, meeting_id).organizer_email
    result = services.cancel_meeting(
        db,
        meeting_id,
        requester_email,
        payload.reason,
    )
    background_tasks.add_task(reminders.process_due_reminders_task)
    background_tasks.add_task(google_calendar.sync_meeting_if_connected_task, meeting_id)
    return result


@router.post("/meetings/{meeting_id}/invitations/respond", response_model=schemas.MeetingOut)
def respond_to_invitation(
    meeting_id: int,
    payload: schemas.InvitationResponseRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    account: models.UserAccount | None = Depends(auth.get_current_account),
):
    result = services.respond_to_invitation(
        db,
        meeting_id,
        _identity(account, str(payload.email)),
        models.InvitationStatus(payload.status),
    )
    background_tasks.add_task(reminders.process_due_reminders_task)
    return result


@router.get("/rooms", response_model=list[schemas.RoomOut])
def list_rooms(
    db: Session = Depends(get_db),
    account: models.UserAccount | None = Depends(auth.get_current_account),
):
    rooms = db.scalars(
        select(models.Room).where(models.Room.is_active.is_(True)).order_by(models.Room.capacity)
    ).all()
    return [services.room_to_out(db, room, account.id if account else None) for room in rooms]


@router.get("/employees", response_model=list[schemas.EmployeeOut])
def list_employees(
    db: Session = Depends(get_db),
    _account: models.UserAccount | None = Depends(auth.get_current_account),
):
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
    account: models.UserAccount | None = Depends(auth.get_current_account),
):
    rooms = services.available_rooms(
        db, start_time, end_time, min_capacity, account.id if account else None
    )
    return [services.room_to_out(db, room, account.id if account else None) for room in rooms]


@router.post("/rooms/bookings", response_model=schemas.BookingOut, status_code=status.HTTP_201_CREATED)
def book_room(
    payload: schemas.BookingCreate,
    db: Session = Depends(get_db),
    account: models.UserAccount | None = Depends(auth.get_current_account),
):
    requester_email = account.email if account else None
    if account is not None and account.role == models.AccountRole.ADMIN:
        requester_email = services.get_meeting_or_404(db, payload.meeting_id).organizer_email
    return services.create_booking(
        db,
        payload,
        account_id=account.id if account else None,
        requester_email=requester_email,
    )


@router.get("/admin/rooms", response_model=list[schemas.RoomOut])
def admin_list_rooms(
    requester_email: str,
    db: Session = Depends(get_db),
    account: models.UserAccount | None = Depends(auth.get_current_account),
):
    return services.list_admin_rooms(db, _identity(account, requester_email))


@router.post("/admin/rooms", response_model=schemas.RoomOut, status_code=status.HTTP_201_CREATED)
def admin_create_room(
    payload: schemas.RoomAdminCreate,
    db: Session = Depends(get_db),
    account: models.UserAccount | None = Depends(auth.get_current_account),
):
    if account is not None:
        auth.require_role(account, {models.AccountRole.ADMIN})
        payload = payload.model_copy(update={"requester_email": account.email})
    return services.create_admin_room(db, payload)


@router.patch("/admin/rooms/{room_id}", response_model=schemas.RoomOut)
def admin_update_room(
    room_id: int,
    payload: schemas.RoomAdminUpdate,
    db: Session = Depends(get_db),
    account: models.UserAccount | None = Depends(auth.get_current_account),
):
    if account is not None:
        auth.require_role(account, {models.AccountRole.ADMIN})
        payload = payload.model_copy(update={"requester_email": account.email})
    return services.update_admin_room(db, room_id, payload)


@router.delete("/admin/rooms/{room_id}", response_model=schemas.RoomOut)
def admin_deactivate_room(
    room_id: int,
    requester_email: str,
    db: Session = Depends(get_db),
    account: models.UserAccount | None = Depends(auth.get_current_account),
):
    return services.deactivate_admin_room(db, room_id, _identity(account, requester_email))


@router.get("/equipment", response_model=list[schemas.EquipmentOut])
def equipment_directory(
    start_time: datetime | None = None,
    end_time: datetime | None = None,
    category: str | None = None,
    status_filter: Literal["available", "booked", "maintenance", "inactive"] | None = Query(default=None, alias="status"),
    db: Session = Depends(get_db),
    _account: models.UserAccount | None = Depends(auth.get_current_account),
):
    return services.list_equipment(db, start_time, end_time, category, status_filter)


@router.get("/equipment/available", response_model=list[schemas.EquipmentOut])
def available_equipment(
    start_time: datetime,
    end_time: datetime,
    category: str | None = None,
    db: Session = Depends(get_db),
    _account: models.UserAccount | None = Depends(auth.get_current_account),
):
    return services.list_equipment(db, start_time, end_time, category, "available", include_inactive=False)


@router.get("/admin/equipment", response_model=list[schemas.EquipmentOut])
def admin_list_equipment(
    requester_email: str,
    db: Session = Depends(get_db),
    account: models.UserAccount | None = Depends(auth.get_current_account),
):
    services.require_admin(_identity(account, requester_email), db)
    return services.list_equipment(db)


@router.post("/admin/equipment", response_model=schemas.EquipmentOut, status_code=status.HTTP_201_CREATED)
def admin_create_equipment(
    payload: schemas.EquipmentAdminCreate,
    db: Session = Depends(get_db),
    account: models.UserAccount | None = Depends(auth.get_current_account),
):
    if account is not None:
        auth.require_role(account, {models.AccountRole.ADMIN})
        payload = payload.model_copy(update={"requester_email": account.email})
    return services.create_admin_equipment(db, payload)


@router.patch("/admin/equipment/{equipment_id}", response_model=schemas.EquipmentOut)
def admin_update_equipment(
    equipment_id: int,
    payload: schemas.EquipmentAdminUpdate,
    db: Session = Depends(get_db),
    account: models.UserAccount | None = Depends(auth.get_current_account),
):
    if account is not None:
        auth.require_role(account, {models.AccountRole.ADMIN})
        payload = payload.model_copy(update={"requester_email": account.email})
    return services.update_admin_equipment(db, equipment_id, payload)


@router.delete("/admin/equipment/{equipment_id}", response_model=schemas.EquipmentOut)
def admin_deactivate_equipment(
    equipment_id: int,
    requester_email: str,
    db: Session = Depends(get_db),
    account: models.UserAccount | None = Depends(auth.get_current_account),
):
    return services.deactivate_admin_equipment(
        db, equipment_id, _identity(account, requester_email)
    )


@router.get("/meetings/{meeting_id}/calendar.ics")
def meeting_calendar_file(
    meeting_id: int,
    db: Session = Depends(get_db),
    account: models.UserAccount | None = Depends(auth.get_current_account),
):
    meeting = services.get_meeting_or_404(db, meeting_id)
    _can_view_meeting(account, meeting)
    return Response(
        content=calendar_provider.ics(meeting),
        media_type="text/calendar; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="meeting-{meeting.id}.ics"'},
    )


@router.get("/meetings/{meeting_id}/calendar-links", response_model=schemas.CalendarLinksOut)
def meeting_calendar_links(
    meeting_id: int,
    db: Session = Depends(get_db),
    account: models.UserAccount | None = Depends(auth.get_current_account),
):
    meeting = services.get_meeting_or_404(db, meeting_id)
    _can_view_meeting(account, meeting)
    return schemas.CalendarLinksOut(
        google_url=calendar_provider.google_url(meeting),
        outlook_ics_url=f"/api/meetings/{meeting.id}/calendar.ics",
    )


@router.get("/integrations/google/status", response_model=schemas.GoogleConnectionStatusOut)
def google_connection_status(
    email: str = Query(min_length=3),
    db: Session = Depends(get_db),
    account: models.UserAccount | None = Depends(auth.get_current_account),
):
    return google_calendar.connection_status(db, _identity(account, email))


@router.get("/integrations/email/status", response_model=schemas.EmailIntegrationStatusOut)
def email_connection_status(
    _account: models.UserAccount | None = Depends(auth.get_current_account),
):
    return reminders.email_integration_status()


@router.get("/integrations/google/connect", response_model=schemas.GoogleConnectUrlOut)
def google_connect(
    email: str = Query(min_length=3),
    account: models.UserAccount | None = Depends(auth.get_current_account),
):
    return schemas.GoogleConnectUrlOut(
        authorization_url=google_calendar.authorization_url(_identity(account, email))
    )


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
def google_disconnect(
    email: str = Query(min_length=3),
    db: Session = Depends(get_db),
    account: models.UserAccount | None = Depends(auth.get_current_account),
):
    google_calendar.disconnect(db, _identity(account, email))
    return schemas.MessageOut(message="Đã ngắt kết nối Google Calendar")


@router.post(
    "/meetings/{meeting_id}/google-calendar/sync",
    response_model=schemas.GoogleCalendarEventOut,
)
def sync_google_calendar(
    meeting_id: int,
    payload: schemas.GoogleSyncRequest,
    db: Session = Depends(get_db),
    account: models.UserAccount | None = Depends(auth.get_current_account),
):
    meeting = services.get_meeting_or_404(db, meeting_id)
    requester_email = _identity(account, str(payload.requester_email))
    if account is not None and account.role == models.AccountRole.ADMIN:
        requester_email = meeting.organizer_email
    return google_calendar.sync_meeting(
        db, meeting, requester_email
    )


@router.get("/notifications", response_model=list[schemas.NotificationOut])
def notifications(
    email: str = Query(min_length=3),
    db: Session = Depends(get_db),
    account: models.UserAccount | None = Depends(auth.get_current_account),
):
    return services.list_notifications(db, _identity(account, email))


@router.post("/notifications/{notification_id}/read", response_model=schemas.NotificationOut)
def read_notification(
    notification_id: int,
    payload: schemas.NotificationReadRequest,
    db: Session = Depends(get_db),
    account: models.UserAccount | None = Depends(auth.get_current_account),
):
    return services.mark_notification_read(
        db, notification_id, _identity(account, str(payload.email))
    )


@router.get("/admin/users", response_model=schemas.AccountPage)
def admin_users(
    search: str | None = None,
    role: models.AccountRole | None = None,
    is_active: bool | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=100),
    _admin: models.UserAccount = Depends(auth.require_admin),
    db: Session = Depends(get_db),
):
    return account_services.list_accounts(
        db,
        search=search,
        role=role,
        is_active=is_active,
        page=page,
        page_size=page_size,
    )


@router.post("/admin/users", response_model=schemas.AccountOut, status_code=status.HTTP_201_CREATED)
def admin_create_user(
    payload: schemas.AccountCreate,
    admin: models.UserAccount = Depends(auth.require_admin),
    db: Session = Depends(get_db),
):
    return account_services.account_to_out(account_services.create_account(db, admin, payload))


@router.patch("/admin/users/{account_id}", response_model=schemas.AccountOut)
def admin_update_user(
    account_id: int,
    payload: schemas.AccountUpdate,
    admin: models.UserAccount = Depends(auth.require_admin),
    db: Session = Depends(get_db),
):
    return account_services.account_to_out(
        account_services.update_account(db, admin, account_id, payload)
    )


@router.get(
    "/admin/users/{account_id}/room-permissions",
    response_model=list[schemas.RoomPermissionOut],
)
def admin_room_permissions(
    account_id: int,
    _admin: models.UserAccount = Depends(auth.require_admin),
    db: Session = Depends(get_db),
):
    return account_services.room_permissions(db, account_id)


@router.put(
    "/admin/users/{account_id}/room-permissions/{room_id}",
    response_model=schemas.RoomPermissionOut,
)
def admin_update_room_permission(
    account_id: int,
    room_id: int,
    payload: schemas.RoomPermissionUpdate,
    admin: models.UserAccount = Depends(auth.require_admin),
    db: Session = Depends(get_db),
):
    return account_services.update_room_permission(db, admin, account_id, room_id, payload)


def _report(
    db: Session,
    date_from: datetime | None,
    date_to: datetime | None,
    room_id: int | None,
    floor: int | None,
    building: str | None,
) -> schemas.ReportOverviewOut:
    now = datetime.now(timezone.utc)
    end = date_to or now + timedelta(days=30)
    start = date_from or now - timedelta(days=30)
    return report_services.report_overview(
        db,
        date_from=start,
        date_to=end,
        room_id=room_id,
        floor=floor,
        building=building,
    )


@router.get("/admin/reports/overview", response_model=schemas.ReportOverviewOut)
def admin_report_overview(
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    room_id: int | None = Query(default=None, ge=1),
    floor: int | None = Query(default=None, ge=0),
    building: str | None = None,
    _admin: models.UserAccount = Depends(auth.require_admin),
    db: Session = Depends(get_db),
):
    return _report(db, date_from, date_to, room_id, floor, building)


@router.get("/admin/reports/export")
def admin_export_report(
    format: Literal["xlsx", "pdf"] = Query(alias="format"),
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    room_id: int | None = Query(default=None, ge=1),
    floor: int | None = Query(default=None, ge=0),
    building: str | None = None,
    _admin: models.UserAccount = Depends(auth.require_admin),
    db: Session = Depends(get_db),
):
    report = _report(db, date_from, date_to, room_id, floor, building)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M")
    if format == "xlsx":
        content = report_services.export_excel(report)
        media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    else:
        content = report_services.export_pdf(report)
        media_type = "application/pdf"
    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="ictu-meeting-report-{stamp}.{format}"'},
    )
