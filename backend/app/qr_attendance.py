"""Signed QR booking attendance flow for Sprint 4 US27."""

from __future__ import annotations

import base64
import hashlib
import hmac
import io
import json
import time
from datetime import datetime, timedelta, timezone

import qrcode
import qrcode.image.svg
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from . import auth, models, schemas
from .config import get_settings


PURPOSE = "booking_attendance_qr"


def _encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def _decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def _booking_query():
    return select(models.RoomBooking).options(
        selectinload(models.RoomBooking.room),
        selectinload(models.RoomBooking.meeting).selectinload(models.Meeting.participants),
    )


def _audit(
    db: Session,
    account: models.UserAccount | None,
    action: str,
    outcome: str,
    booking_id: int | None,
    detail: str | None = None,
) -> None:
    db.add(
        models.BookingUsageAudit(
            booking_id=booking_id,
            actor_account_id=account.id if account else None,
            action=action,
            outcome=outcome,
            detail=(detail or "")[:500] or None,
        )
    )


def _deny(
    db: Session,
    account: models.UserAccount | None,
    action: str,
    booking_id: int | None,
    detail: str,
    status_code: int = status.HTTP_403_FORBIDDEN,
):
    _audit(db, account, action, "denied", booking_id, detail)
    db.commit()
    raise HTTPException(status_code=status_code, detail=detail)


def _authorized(account: models.UserAccount, meeting: models.Meeting) -> bool:
    if account.role == models.AccountRole.ADMIN or account.email == meeting.organizer_email:
        return True
    return any(participant.email == account.email for participant in meeting.participants)


def _notify_organizer_attendance(
    db: Session,
    booking: models.RoomBooking,
    account: models.UserAccount,
    *,
    checked_in: bool,
    occurred_at: datetime,
) -> None:
    meeting = booking.meeting
    if account.email == meeting.organizer_email:
        return
    action_key = "check-in" if checked_in else "check-out"
    event_key = f"attendance:{action_key}:booking:{booking.id}:account:{account.id}"
    if db.scalar(select(models.Reminder.id).where(models.Reminder.event_key == event_key)):
        return
    action_text = "đã check-in" if checked_in else "đã check-out"
    person_name = account.employee.full_name
    db.add(
        models.Reminder(
            meeting_id=meeting.id,
            recipient_email=meeting.organizer_email,
            channel="in_app",
            kind=(
                models.NotificationKind.ATTENDANCE_CHECKED_IN
                if checked_in
                else models.NotificationKind.ATTENDANCE_CHECKED_OUT
            ),
            subject=f"{person_name} {action_text}",
            body=(
                f"{person_name} ({account.email}) {action_text} cuộc họp “{meeting.title}” "
                f"tại phòng {booking.room.name}."
            ),
            event_key=event_key,
            remind_at=occurred_at,
            status=models.NotificationStatus.SENT,
            attempts=1,
            sent_at=occurred_at,
        )
    )


def _token_payload(token: str) -> dict:
    settings = get_settings()
    try:
        encoded, signature = token.split(".", 1)
        expected = _encode(
            hmac.new(auth.signing_secret(settings), encoded.encode("ascii"), hashlib.sha256).digest()
        )
        if not hmac.compare_digest(signature, expected):
            raise ValueError("signature")
        payload = json.loads(_decode(encoded))
        if payload.get("purpose") != PURPOSE or int(payload.get("exp", 0)) <= int(time.time()):
            raise ValueError("expired")
        return payload
    except HTTPException:
        raise
    except (ValueError, TypeError, KeyError, json.JSONDecodeError):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Mã QR không hợp lệ hoặc đã hết hạn",
        ) from None


def _signed_token(booking: models.RoomBooking) -> tuple[str, datetime]:
    settings = get_settings()
    now = datetime.now(timezone.utc)
    booking_end = booking.end_time
    if booking_end.tzinfo is None:
        booking_end = booking_end.replace(tzinfo=timezone.utc)
    expires_at = max(
        now + timedelta(minutes=settings.qr_token_minutes),
        booking_end + timedelta(minutes=settings.qr_checkout_grace_minutes),
    )
    payload = {
        "purpose": PURPOSE,
        "booking_id": booking.id,
        "room_id": booking.room_id,
        "exp": int(expires_at.timestamp()),
        "v": 1,
    }
    encoded = _encode(json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8"))
    signature = _encode(
        hmac.new(auth.signing_secret(settings), encoded.encode("ascii"), hashlib.sha256).digest()
    )
    return f"{encoded}.{signature}", expires_at


def generate_qr(
    db: Session,
    booking_id: int,
    account: models.UserAccount,
) -> schemas.BookingQrOut:
    booking = db.scalar(_booking_query().where(models.RoomBooking.id == booking_id))
    if booking is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy lượt đặt phòng")
    meeting = booking.meeting
    if account.role != models.AccountRole.ADMIN and account.email != meeting.organizer_email:
        _deny(db, account, "qr.generated", booking.id, "Chỉ người tổ chức hoặc Admin được tạo mã QR")
    if booking.status != models.BookingStatus.ACTIVE or meeting.status != models.MeetingStatus.SCHEDULED:
        _deny(
            db,
            account,
            "qr.generated",
            booking.id,
            "Không thể tạo QR cho cuộc họp đã hủy",
            status.HTTP_409_CONFLICT,
        )

    token, expires_at = _signed_token(booking)
    image = qrcode.make(token, image_factory=qrcode.image.svg.SvgPathImage, box_size=8, border=2)
    buffer = io.BytesIO()
    image.save(buffer)
    image_data_url = "data:image/svg+xml;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")
    _audit(db, account, "qr.generated", "success", booking.id)
    db.commit()
    return schemas.BookingQrOut(
        booking_id=booking.id,
        room_id=booking.room_id,
        expires_at=expires_at,
        qr_token=token,
        image_data_url=image_data_url,
    )


def _resolve(
    db: Session,
    token: str,
    account: models.UserAccount,
    action: str,
) -> tuple[models.RoomBooking, models.BookingAttendance | None]:
    try:
        payload = _token_payload(token)
    except HTTPException as exc:
        _audit(db, account, action, "denied", None, str(exc.detail))
        db.commit()
        raise
    booking_id = int(payload.get("booking_id", 0))
    booking = db.scalar(_booking_query().where(models.RoomBooking.id == booking_id))
    if booking is None or booking.room_id != int(payload.get("room_id", 0)):
        _deny(db, account, action, booking_id or None, "Mã QR không khớp với phòng hoặc lượt đặt")
    if booking.status != models.BookingStatus.ACTIVE or booking.meeting.status != models.MeetingStatus.SCHEDULED:
        _deny(db, account, action, booking.id, "Cuộc họp đã hủy hoặc lượt đặt không còn hiệu lực", status.HTTP_409_CONFLICT)
    if not _authorized(account, booking.meeting):
        _deny(db, account, action, booking.id, "Bạn không thuộc cuộc họp này")

    now = datetime.now(timezone.utc)
    start = booking.start_time if booking.start_time.tzinfo else booking.start_time.replace(tzinfo=timezone.utc)
    end = booking.end_time if booking.end_time.tzinfo else booking.end_time.replace(tzinfo=timezone.utc)
    settings = get_settings()
    if now < start - timedelta(minutes=settings.qr_checkin_early_minutes):
        _deny(db, account, action, booking.id, "Chưa đến thời gian check-in", status.HTTP_409_CONFLICT)
    if now > end + timedelta(minutes=settings.qr_checkout_grace_minutes):
        _deny(db, account, action, booking.id, "Đã quá thời gian check-in/check-out", status.HTTP_409_CONFLICT)

    attendance = db.scalar(
        select(models.BookingAttendance).where(
            models.BookingAttendance.booking_id == booking.id,
            models.BookingAttendance.account_id == account.id,
        )
    )
    return booking, attendance


def inspect_qr(
    db: Session,
    token: str,
    account: models.UserAccount,
) -> schemas.BookingQrInspectionOut:
    booking, attendance = _resolve(db, token, account, "qr.inspected")
    _audit(db, account, "qr.inspected", "success", booking.id)
    db.commit()
    return schemas.BookingQrInspectionOut(
        booking_id=booking.id,
        meeting_id=booking.meeting.id,
        meeting_title=booking.meeting.title,
        room_id=booking.room_id,
        room_name=booking.room.name,
        start_time=booking.start_time,
        end_time=booking.end_time,
        meeting_status=booking.meeting.status,
        checked_in_at=attendance.checked_in_at if attendance else None,
        checked_out_at=attendance.checked_out_at if attendance else None,
        can_check_in=attendance is None or attendance.checked_in_at is None,
        can_check_out=bool(attendance and attendance.checked_in_at and not attendance.checked_out_at),
    )


def check_in(
    db: Session,
    token: str,
    account: models.UserAccount,
) -> schemas.BookingAttendanceOut:
    booking, attendance = _resolve(db, token, account, "attendance.check_in")
    already_recorded = bool(attendance and attendance.checked_in_at)
    if attendance is None:
        attendance = models.BookingAttendance(booking_id=booking.id, account_id=account.id)
        db.add(attendance)
    if attendance.checked_in_at is None:
        attendance.checked_in_at = datetime.now(timezone.utc)
        _notify_organizer_attendance(
            db,
            booking,
            account,
            checked_in=True,
            occurred_at=attendance.checked_in_at,
        )
    _audit(db, account, "attendance.check_in", "idempotent" if already_recorded else "success", booking.id)
    db.commit()
    db.refresh(attendance)
    return schemas.BookingAttendanceOut(
        booking_id=booking.id,
        account_id=account.id,
        checked_in_at=attendance.checked_in_at,
        checked_out_at=attendance.checked_out_at,
        already_recorded=already_recorded,
        message="Bạn đã check-in trước đó." if already_recorded else "Check-in thành công.",
    )


def check_out(
    db: Session,
    token: str,
    account: models.UserAccount,
) -> schemas.BookingAttendanceOut:
    booking, attendance = _resolve(db, token, account, "attendance.check_out")
    if attendance is None or attendance.checked_in_at is None:
        _deny(db, account, "attendance.check_out", booking.id, "Bạn phải check-in trước khi check-out", status.HTTP_409_CONFLICT)
    already_recorded = attendance.checked_out_at is not None
    if attendance.checked_out_at is None:
        attendance.checked_out_at = datetime.now(timezone.utc)
        _notify_organizer_attendance(
            db,
            booking,
            account,
            checked_in=False,
            occurred_at=attendance.checked_out_at,
        )
    _audit(db, account, "attendance.check_out", "idempotent" if already_recorded else "success", booking.id)
    db.commit()
    db.refresh(attendance)
    return schemas.BookingAttendanceOut(
        booking_id=booking.id,
        account_id=account.id,
        checked_in_at=attendance.checked_in_at,
        checked_out_at=attendance.checked_out_at,
        already_recorded=already_recorded,
        message="Bạn đã check-out trước đó." if already_recorded else "Check-out thành công.",
    )
