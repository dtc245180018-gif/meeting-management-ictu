from __future__ import annotations

import logging
import smtplib
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from threading import Lock

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from . import models
from .config import get_settings
from .database import SessionLocal


logger = logging.getLogger(__name__)
ICTU_TIMEZONE = timezone(timedelta(hours=7), name="Asia/Ho_Chi_Minh")
MEETING_START_NOTICE_MINUTES = 5
_processing_lock = Lock()


def _meeting_details(meeting: models.Meeting) -> str:
    start_local = meeting.start_time.astimezone(ICTU_TIMEZONE)
    end_local = meeting.end_time.astimezone(ICTU_TIMEZONE)
    room = meeting.booking.room.name if meeting.booking and meeting.booking.room else "Chưa đặt phòng"
    return (
        f"Cuộc họp: {meeting.title}\n"
        f"Bắt đầu: {start_local:%H:%M ngày %d/%m/%Y} (Asia/Ho_Chi_Minh)\n"
        f"Kết thúc: {end_local:%H:%M ngày %d/%m/%Y} (Asia/Ho_Chi_Minh)\n"
        f"Phòng: {room}\n"
        f"Người tổ chức: {meeting.organizer_email}"
    )


def _meeting_url(meeting_id: int) -> str:
    frontend_url = getattr(get_settings(), "frontend_url", "http://localhost:5173")
    return f"{frontend_url.rstrip('/')}?meeting={meeting_id}"


def _append_notification(
    meeting: models.Meeting,
    recipient_email: str,
    kind: models.NotificationKind,
    subject: str,
    body: str,
    event_key: str,
    now: datetime | None = None,
) -> None:
    if any(item.event_key == event_key for item in meeting.reminders):
        return
    meeting.reminders.append(
        models.Reminder(
            recipient_email=recipient_email.strip().lower(),
            channel="email",
            kind=kind,
            subject=subject,
            body=body,
            event_key=event_key,
            remind_at=now or datetime.now(timezone.utc),
        )
    )


def add_invitation_notifications(meeting: models.Meeting, recipient_emails: list[str]) -> None:
    details = _meeting_details(meeting)
    for email in sorted({value.strip().lower() for value in recipient_emails if value.strip()}):
        _append_notification(
            meeting,
            email,
            models.NotificationKind.INVITATION,
            f"Lời mời họp: {meeting.title}",
            (
                "Bạn được mời tham dự một cuộc họp.\n\n"
                f"{details}\n\n"
                f"Mở hệ thống để chấp nhận hoặc từ chối: {_meeting_url(meeting.id)}"
            ),
            f"invitation:{meeting.id}:{email}",
        )


def add_update_notifications(
    meeting: models.Meeting,
    recipient_emails: list[str],
    removed_emails: list[str] | None = None,
) -> None:
    now = datetime.now(timezone.utc)
    revision = int(now.timestamp() * 1_000_000)
    details = _meeting_details(meeting)
    for email in sorted({value.strip().lower() for value in recipient_emails if value.strip()}):
        _append_notification(
            meeting,
            email,
            models.NotificationKind.MEETING_UPDATED,
            f"Lịch họp đã cập nhật: {meeting.title}",
            f"Thông tin cuộc họp đã thay đổi.\n\n{details}\n\nChi tiết: {_meeting_url(meeting.id)}",
            f"meeting-updated:{meeting.id}:{revision}:{email}",
            now,
        )
    for email in sorted({value.strip().lower() for value in (removed_emails or []) if value.strip()}):
        _append_notification(
            meeting,
            email,
            models.NotificationKind.MEETING_CANCELLED,
            f"Bạn đã được gỡ khỏi cuộc họp: {meeting.title}",
            f"Bạn không còn trong danh sách tham dự.\n\n{details}",
            f"participant-removed:{meeting.id}:{revision}:{email}",
            now,
        )


def add_cancellation_notifications(meeting: models.Meeting, recipient_emails: list[str]) -> None:
    details = _meeting_details(meeting)
    for email in sorted({value.strip().lower() for value in recipient_emails if value.strip()}):
        _append_notification(
            meeting,
            email,
            models.NotificationKind.MEETING_CANCELLED,
            f"Cuộc họp đã hủy: {meeting.title}",
            f"Người tổ chức đã hủy cuộc họp sau.\n\n{details}",
            f"meeting-cancelled:{meeting.id}:{email}",
        )


def add_response_notification(meeting: models.Meeting, participant_email: str, response: models.InvitationStatus) -> None:
    response_text = "chấp nhận" if response == models.InvitationStatus.ACCEPTED else "từ chối"
    normalized = participant_email.strip().lower()
    _append_notification(
        meeting,
        meeting.organizer_email,
        models.NotificationKind.INVITATION_RESPONSE,
        f"Phản hồi lời mời: {meeting.title}",
        f"{normalized} đã {response_text} lời mời tham dự cuộc họp '{meeting.title}'.",
        f"invitation-response:{meeting.id}:{normalized}:{response.value}",
    )


def add_meeting_reminders(
    meeting: models.Meeting,
    recipients: list[str],
    reminder_minutes: int | None,
) -> None:
    if reminder_minutes is None:
        return
    remind_at = meeting.start_time - timedelta(minutes=reminder_minutes)
    for email in sorted({value.strip().lower() for value in recipients if value.strip()}):
        meeting.reminders.append(
            models.Reminder(
                recipient_email=email,
                channel="email",
                kind=models.NotificationKind.REMINDER,
                remind_at=remind_at,
            )
        )


def sync_meeting_starting_notifications(
    meeting: models.Meeting,
    recipients: list[str],
) -> None:
    """Keep one durable, automatic five-minute alert per attendee.

    Unlike the optional email reminder, this in-app alert is always created and
    only becomes visible when its due time is reached.
    """
    desired = {value.strip().lower() for value in recipients if value.strip()}
    remind_at = meeting.start_time - timedelta(minutes=MEETING_START_NOTICE_MINUTES)
    existing = {
        item.recipient_email: item
        for item in meeting.reminders
        if item.kind == models.NotificationKind.MEETING_STARTING
    }

    for email, item in existing.items():
        if email not in desired:
            item.status = models.NotificationStatus.CANCELLED

    for email in sorted(desired):
        item = existing.get(email)
        event_key = f"meeting-starting:{meeting.id}:{email}"
        if item is None:
            meeting.reminders.append(
                models.Reminder(
                    recipient_email=email,
                    channel="email",
                    kind=models.NotificationKind.MEETING_STARTING,
                    subject=f"Sắp đến giờ họp: {meeting.title}",
                    event_key=event_key,
                    remind_at=remind_at,
                )
            )
            continue

        schedule_changed = item.remind_at != remind_at
        item.remind_at = remind_at
        item.subject = f"Sắp đến giờ họp: {meeting.title}"
        item.event_key = event_key
        if schedule_changed or item.status in {
            models.NotificationStatus.CANCELLED,
            models.NotificationStatus.FAILED,
        }:
            item.status = models.NotificationStatus.PENDING
            item.attempts = 0
            item.error_message = None
            item.sent_at = None
            item.is_read = False


def backfill_meeting_starting_notifications() -> int:
    """Add automatic join alerts to meetings created before this feature existed."""
    now = datetime.now(timezone.utc)
    with SessionLocal() as db:
        meetings = list(
            db.scalars(
                select(models.Meeting)
                .options(
                    selectinload(models.Meeting.participants),
                    selectinload(models.Meeting.reminders),
                )
                .where(
                    models.Meeting.status == models.MeetingStatus.SCHEDULED,
                    models.Meeting.end_time > now,
                )
            ).all()
        )
        for meeting in meetings:
            recipients = [
                meeting.organizer_email,
                *(item.email for item in meeting.participants if item.status != models.InvitationStatus.DECLINED),
            ]
            sync_meeting_starting_notifications(meeting, recipients)
        if meetings:
            db.commit()
        return len(meetings)


def sync_pending_reminders(
    meeting: models.Meeting,
    recipients: list[str],
    old_start: datetime,
    reminder_minutes: int | None = None,
) -> None:
    desired = {value.strip().lower() for value in recipients if value.strip()}
    pending = [
        item for item in meeting.reminders
        if item.status == models.NotificationStatus.PENDING
        and item.kind == models.NotificationKind.REMINDER
    ]
    if not pending and reminder_minutes is None:
        return

    if reminder_minutes is None and pending:
        reminder_minutes = max(0, round((old_start - pending[0].remind_at).total_seconds() / 60))
    if reminder_minutes is None:
        return

    remind_at = meeting.start_time - timedelta(minutes=reminder_minutes)
    # Cancel obsolete pending rows first. Updating one in place can collide
    # with a previous cancelled reminder at the new target time.
    for item in pending:
        if item.recipient_email not in desired or item.remind_at != remind_at:
            item.status = models.NotificationStatus.CANCELLED

    for email in sorted(desired):
        matching = [
            item for item in meeting.reminders
            if item.recipient_email == email and item.remind_at == remind_at
        ]
        active = next((item for item in matching if item.status == models.NotificationStatus.PENDING), None)
        reusable = next(
            (
                item for item in matching
                if item.status in {models.NotificationStatus.CANCELLED, models.NotificationStatus.FAILED}
            ),
            None,
        )
        if active is None and not any(item.status == models.NotificationStatus.SENT for item in matching):
            active = reusable
            if active is None:
                active = models.Reminder(recipient_email=email, channel="email", remind_at=remind_at)
                meeting.reminders.append(active)
            active.status = models.NotificationStatus.PENDING
        if active is not None:
            active.attempts = 0
            active.error_message = None
            active.sent_at = None
            active.is_read = False


def cancel_pending_reminders(
    meeting: models.Meeting,
    kinds: set[models.NotificationKind] | None = None,
) -> None:
    for item in meeting.reminders:
        if item.status == models.NotificationStatus.PENDING and (kinds is None or item.kind in kinds):
            item.status = models.NotificationStatus.CANCELLED


def _send_email(reminder: models.Reminder) -> None:
    settings = get_settings()
    meeting = reminder.meeting
    if reminder.kind == models.NotificationKind.MEETING_STARTING:
        subject = reminder.subject or f"Sắp đến giờ họp: {meeting.title}"
        body = (
            f"Cuộc họp sẽ bắt đầu trong {MEETING_START_NOTICE_MINUTES} phút.\n\n"
            f"{_meeting_details(meeting)}\n\n"
            f"Vào họp: {_meeting_url(meeting.id)}"
        )
    else:
        subject = reminder.subject or f"Nhắc lịch họp: {meeting.title}"
        body = reminder.body or (
            f"Cuộc họp sắp bắt đầu.\n\n{_meeting_details(meeting)}\n\n"
            f"Chi tiết: {_meeting_url(meeting.id)}"
        )
    if settings.email_backend.lower() == "console":
        logger.info("EMAIL_BACKEND=console recipient=%s subject=%s\n%s", reminder.recipient_email, subject, body)
        return
    if settings.email_backend.lower() != "smtp":
        raise RuntimeError("EMAIL_BACKEND phải là console hoặc smtp")
    if not settings.smtp_host or not settings.smtp_from_email:
        raise RuntimeError("Chưa cấu hình SMTP_HOST hoặc SMTP_FROM_EMAIL")

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = settings.smtp_from_email
    message["To"] = reminder.recipient_email
    message.set_content(body)
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as smtp:
        if settings.smtp_use_tls:
            smtp.starttls()
        if settings.smtp_username:
            smtp.login(settings.smtp_username, settings.smtp_password)
        smtp.send_message(message)


def email_integration_status() -> dict:
    settings = get_settings()
    backend = settings.email_backend.strip().lower()
    if backend == "smtp":
        configured = bool(
            settings.smtp_host
            and settings.smtp_from_email
            and (not settings.smtp_username or settings.smtp_password)
        )
        return {
            "backend": "smtp",
            "configured": configured,
            "sender": settings.smtp_from_email or None,
            "detail": (
                "SMTP đã cấu hình để gửi email thật"
                if configured
                else "SMTP chưa đủ host, địa chỉ gửi hoặc mật khẩu"
            ),
        }
    return {
        "backend": "console",
        "configured": False,
        "sender": None,
        "detail": "Chế độ console chỉ ghi email vào log, không gửi tới hộp thư",
    }


def _process_due_reminders(db: Session, now: datetime | None = None) -> int:
    current = now or datetime.now(timezone.utc)
    reminders = list(
        db.scalars(
            select(models.Reminder)
            .options(selectinload(models.Reminder.meeting))
            .where(
                models.Reminder.status == models.NotificationStatus.PENDING,
                models.Reminder.remind_at <= current,
            )
            .order_by(models.Reminder.remind_at)
            .with_for_update(skip_locked=True)
        ).all()
    )
    processed = 0
    settings = get_settings()
    for reminder in reminders:
        if (
            reminder.meeting.status == models.MeetingStatus.CANCELLED
            and reminder.kind != models.NotificationKind.MEETING_CANCELLED
        ):
            reminder.status = models.NotificationStatus.CANCELLED
            processed += 1
            continue
        try:
            _send_email(reminder)
            reminder.status = models.NotificationStatus.SENT
            reminder.sent_at = current
            reminder.error_message = None
        except Exception as exc:  # SMTP/console backend failures are persisted for retry.
            reminder.attempts += 1
            reminder.error_message = str(exc)[:2000]
            if reminder.attempts >= settings.reminder_max_attempts:
                reminder.status = models.NotificationStatus.FAILED
        processed += 1
    if processed:
        db.commit()
    return processed


def process_due_reminders(db: Session, now: datetime | None = None) -> int:
    # PostgreSQL row locks protect multi-process production workers; this lock
    # prevents duplicate SMTP sends from the worker and BackgroundTasks in the
    # single-process SQLite development server.
    with _processing_lock:
        return _process_due_reminders(db, now)


def process_due_reminders_task() -> int:
    with SessionLocal() as db:
        return process_due_reminders(db)
