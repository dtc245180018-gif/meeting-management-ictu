from __future__ import annotations

import logging
import smtplib
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from . import models
from .config import get_settings
from .database import SessionLocal


logger = logging.getLogger(__name__)


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
                remind_at=remind_at,
            )
        )


def sync_pending_reminders(
    meeting: models.Meeting,
    recipients: list[str],
    old_start: datetime,
    reminder_minutes: int | None = None,
) -> None:
    desired = {value.strip().lower() for value in recipients if value.strip()}
    pending = [item for item in meeting.reminders if item.status == models.NotificationStatus.PENDING]
    if not pending and reminder_minutes is None:
        return

    if reminder_minutes is None and pending:
        reminder_minutes = max(0, round((old_start - pending[0].remind_at).total_seconds() / 60))
    if reminder_minutes is None:
        return

    remind_at = meeting.start_time - timedelta(minutes=reminder_minutes)
    existing_by_email = {item.recipient_email: item for item in pending}
    for item in pending:
        if item.recipient_email not in desired:
            item.status = models.NotificationStatus.CANCELLED
        else:
            item.remind_at = remind_at
            item.error_message = None
            item.attempts = 0

    for email in sorted(desired - set(existing_by_email)):
        meeting.reminders.append(
            models.Reminder(recipient_email=email, channel="email", remind_at=remind_at)
        )


def cancel_pending_reminders(meeting: models.Meeting) -> None:
    for item in meeting.reminders:
        if item.status == models.NotificationStatus.PENDING:
            item.status = models.NotificationStatus.CANCELLED


def _send_email(reminder: models.Reminder) -> None:
    settings = get_settings()
    meeting = reminder.meeting
    subject = f"Nhắc lịch họp: {meeting.title}"
    body = (
        f"Cuộc họp '{meeting.title}' sẽ bắt đầu lúc {meeting.start_time.isoformat()}.\n"
        f"Kết thúc: {meeting.end_time.isoformat()}.\n"
        f"Người tổ chức: {meeting.organizer_email}."
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


def process_due_reminders(db: Session, now: datetime | None = None) -> int:
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
        ).all()
    )
    processed = 0
    settings = get_settings()
    for reminder in reminders:
        if reminder.meeting.status == models.MeetingStatus.CANCELLED:
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


def process_due_reminders_task() -> int:
    with SessionLocal() as db:
        return process_due_reminders(db)
