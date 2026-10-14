"""Stateless, signed confirmation flow for Sprint 4 chatbot bookings."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from datetime import datetime, timezone

from fastapi import HTTPException, status
from pydantic import ValidationError
from sqlalchemy.orm import Session

from . import auth, models, schemas, services
from .config import Settings, get_settings


_TOKEN_PURPOSE = "chatbot_booking_confirmation"
_REQUIRED_FIELDS = {
    "organizer_email": "email người tổ chức",
    "title": "tên cuộc họp",
    "start_time": "thời gian bắt đầu",
    "end_time": "thời gian kết thúc",
    "expected_attendees": "số người dự kiến",
}


def normalize_booking_draft(
    draft: schemas.ChatbotBookingDraft,
    account: models.UserAccount | None,
) -> schemas.ChatbotBookingDraft:
    organizer = (account.email if account else str(draft.organizer_email or "")).strip().lower()
    return draft.model_copy(update={"organizer_email": organizer or None})


def missing_booking_fields(draft: schemas.ChatbotBookingDraft) -> list[str]:
    return [
        field
        for field in _REQUIRED_FIELDS
        if getattr(draft, field) in (None, "")
    ]


def _encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def _decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def _validation_detail(error: ValidationError) -> str:
    first = error.errors()[0]
    message = str(first.get("msg", "Dữ liệu đặt phòng không hợp lệ"))
    return message.removeprefix("Value error, ")


def _meeting_payload(
    draft: schemas.ChatbotBookingDraft,
    organizer_email: str,
) -> schemas.MeetingCreate:
    values = draft.model_dump()
    values["organizer_email"] = organizer_email
    try:
        return schemas.MeetingCreate.model_validate(values)
    except ValidationError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=_validation_detail(error),
        ) from None


def _signed_token(
    payload: schemas.MeetingCreate,
    account: models.UserAccount | None,
    settings: Settings,
) -> tuple[str, datetime]:
    expires_at = int(time.time()) + settings.chatbot_confirmation_minutes * 60
    claims = {
        "purpose": _TOKEN_PURPOSE,
        "sub": account.id if account else 0,
        "email": str(payload.organizer_email).strip().lower(),
        "exp": expires_at,
        "meeting": payload.model_dump(mode="json"),
    }
    encoded = _encode(json.dumps(claims, separators=(",", ":"), sort_keys=True).encode("utf-8"))
    signature = _encode(
        hmac.new(auth.signing_secret(settings), encoded.encode("ascii"), hashlib.sha256).digest()
    )
    return f"{encoded}.{signature}", datetime.fromtimestamp(expires_at, tz=timezone.utc)


def _summary(payload: schemas.MeetingCreate, room: models.Room) -> str:
    recurrence = ""
    if payload.recurrence and payload.recurrence_count > 1:
        recurrence_label = "hằng tuần" if payload.recurrence == "weekly" else "hằng tháng"
        recurrence = f", lặp {recurrence_label} {payload.recurrence_count} lần"
    return (
        f"{payload.title}: {payload.start_time.isoformat()} – {payload.end_time.isoformat()}, "
        f"{payload.expected_attendees} người, phòng {room.name}{recurrence}."
    )


def preview_booking(
    db: Session,
    draft: schemas.ChatbotBookingDraft,
    account: models.UserAccount | None,
    settings: Settings | None = None,
) -> schemas.ChatbotBookingPreviewOut:
    normalized_draft = normalize_booking_draft(draft, account)
    organizer = str(normalized_draft.organizer_email or "").strip().lower()
    missing_fields = missing_booking_fields(normalized_draft)
    if missing_fields:
        labels = ", ".join(_REQUIRED_FIELDS[field] for field in missing_fields)
        return schemas.ChatbotBookingPreviewOut(
            ready_to_confirm=False,
            prompt=f"Vui lòng cung cấp thêm: {labels}.",
            missing_fields=missing_fields,
            draft=normalized_draft,
        )

    payload = _meeting_payload(normalized_draft, organizer)
    plan = services.validate_meeting_request(
        db,
        payload,
        account_id=account.id if account else None,
        organizer_email=organizer,
        lock_resources=False,
    )

    if plan.room is None:
        rooms = services.available_rooms_for_occurrences(
            db,
            plan.occurrences,
            max(payload.expected_attendees, len(plan.participant_emails) + 1),
            account.id if account else None,
        )
        room_options = [
            services.room_to_out(db, room, account.id if account else None)
            for room in rooms[:10]
        ]
        prompt = (
            f"Đã tìm thấy {len(rooms)} phòng phù hợp. Hãy chọn một phòng để xác nhận."
            if rooms
            else "Không có phòng phù hợp trong toàn bộ khung thời gian đã chọn."
        )
        return schemas.ChatbotBookingPreviewOut(
            ready_to_confirm=False,
            prompt=prompt,
            missing_fields=["room_id"],
            draft=normalized_draft,
            room_options=room_options,
        )

    current_settings = settings or get_settings()
    token, expires_at = _signed_token(payload, account, current_settings)
    return schemas.ChatbotBookingPreviewOut(
        ready_to_confirm=True,
        prompt="Thông tin hợp lệ. Vui lòng xác nhận để tạo lịch và đặt phòng.",
        draft=normalized_draft,
        room_options=[
            services.room_to_out(db, plan.room, account.id if account else None)
        ],
        summary=_summary(payload, plan.room),
        confirmation_token=token,
        expires_at=expires_at,
    )


def meeting_from_confirmation(
    token: str,
    account: models.UserAccount | None,
    settings: Settings | None = None,
) -> schemas.MeetingCreate:
    current_settings = settings or get_settings()
    try:
        encoded, signature = token.split(".", 1)
        expected = _encode(
            hmac.new(
                auth.signing_secret(current_settings),
                encoded.encode("ascii"),
                hashlib.sha256,
            ).digest()
        )
        if not hmac.compare_digest(signature, expected):
            raise ValueError("signature")
        claims = json.loads(_decode(encoded))
        if claims.get("purpose") != _TOKEN_PURPOSE:
            raise ValueError("purpose")
        if int(claims["exp"]) <= int(time.time()):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Phiên xác nhận chatbot đã hết hạn. Vui lòng kiểm tra phòng lại.",
            )
        email = str(claims["email"]).strip().lower()
        if account is not None and (
            int(claims.get("sub", 0)) != account.id or email != account.email
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Mã xác nhận không thuộc tài khoản đang đăng nhập",
            )
        payload = schemas.MeetingCreate.model_validate(claims["meeting"])
        if str(payload.organizer_email).strip().lower() != email:
            raise ValueError("organizer")
        return payload
    except HTTPException:
        raise
    except (ValueError, KeyError, TypeError, json.JSONDecodeError, ValidationError):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Mã xác nhận chatbot không hợp lệ",
        ) from None
