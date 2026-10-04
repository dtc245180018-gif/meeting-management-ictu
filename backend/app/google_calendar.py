from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import secrets
from datetime import datetime, timedelta, timezone
from urllib.parse import quote, urlencode

import httpx
from cryptography.fernet import Fernet, InvalidToken
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models
from .config import Settings, get_settings
from .database import SessionLocal


logger = logging.getLogger(__name__)
GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"
GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3"
GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke"
GOOGLE_SCOPES = (
    "openid",
    "email",
    "https://www.googleapis.com/auth/calendar.events",
)


def missing_settings(settings: Settings | None = None) -> list[str]:
    current = settings or get_settings()
    values = {
        "GOOGLE_CLIENT_ID": current.google_client_id,
        "GOOGLE_CLIENT_SECRET": current.google_client_secret,
        "GOOGLE_REDIRECT_URI": current.google_redirect_uri,
        "GOOGLE_TOKEN_ENCRYPTION_KEY": current.google_token_encryption_key,
        "GOOGLE_OAUTH_STATE_SECRET": current.google_oauth_state_secret,
    }
    return [name for name, value in values.items() if not value.strip()]


def _require_configured(settings: Settings) -> None:
    missing = missing_settings(settings)
    if missing:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Google Calendar chưa được cấu hình: {', '.join(missing)}",
        )


def _urlsafe_encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode()


def _urlsafe_decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def _state(email: str, settings: Settings) -> str:
    payload = _urlsafe_encode(json.dumps({
        "email": email.strip().lower(),
        "exp": int((datetime.now(timezone.utc) + timedelta(minutes=10)).timestamp()),
        "nonce": secrets.token_urlsafe(18),
    }, separators=(",", ":")).encode())
    signature = hmac.new(
        settings.google_oauth_state_secret.encode(), payload.encode(), hashlib.sha256
    ).digest()
    return f"{payload}.{_urlsafe_encode(signature)}"


def _verify_state(value: str, settings: Settings) -> str:
    try:
        payload, signature = value.split(".", 1)
        expected = hmac.new(
            settings.google_oauth_state_secret.encode(), payload.encode(), hashlib.sha256
        ).digest()
        if not hmac.compare_digest(expected, _urlsafe_decode(signature)):
            raise ValueError("signature")
        decoded = json.loads(_urlsafe_decode(payload))
        if int(decoded["exp"]) < int(datetime.now(timezone.utc).timestamp()):
            raise ValueError("expired")
        return str(decoded["email"]).strip().lower()
    except (KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Phiên kết nối Google không hợp lệ hoặc đã hết hạn",
        ) from exc


def authorization_url(email: str) -> str:
    settings = get_settings()
    _require_configured(settings)
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": settings.google_redirect_uri,
        "response_type": "code",
        "scope": " ".join(GOOGLE_SCOPES),
        "access_type": "offline",
        "include_granted_scopes": "true",
        "prompt": "consent",
        "login_hint": email.strip().lower(),
        "state": _state(email, settings),
    }
    return f"{GOOGLE_AUTH_URL}?{urlencode(params)}"


def _fernet(settings: Settings) -> Fernet:
    try:
        return Fernet(settings.google_token_encryption_key.encode())
    except (TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="GOOGLE_TOKEN_ENCRYPTION_KEY không phải khóa Fernet hợp lệ",
        ) from exc


def _google_error(response: httpx.Response, fallback: str) -> str:
    try:
        payload = response.json()
        error = payload.get("error")
        if isinstance(error, dict):
            return str(error.get("message") or error.get("status") or fallback)
        if error:
            return str(payload.get("error_description") or error)
    except (ValueError, TypeError):
        pass
    return fallback


def complete_oauth(db: Session, code: str, state_value: str) -> models.GoogleCalendarConnection:
    settings = get_settings()
    _require_configured(settings)
    requested_email = _verify_state(state_value, settings)
    with httpx.Client(timeout=20) as client:
        token_response = client.post(GOOGLE_TOKEN_URL, data={
            "code": code,
            "client_id": settings.google_client_id,
            "client_secret": settings.google_client_secret,
            "redirect_uri": settings.google_redirect_uri,
            "grant_type": "authorization_code",
        })
        if not token_response.is_success:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=_google_error(token_response, "Google từ chối mã xác thực OAuth"),
            )
        token_data = token_response.json()
        refresh_token = token_data.get("refresh_token")
        access_token = token_data.get("access_token")
        if not refresh_token or not access_token:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Google không trả refresh token; hãy thu hồi quyền cũ và kết nối lại",
            )
        user_response = client.get(
            GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"},
        )
        if not user_response.is_success:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=_google_error(user_response, "Không đọc được tài khoản Google"),
            )
        user_data = user_response.json()
    google_email = str(user_data.get("email", "")).strip().lower()
    if not google_email or google_email != requested_email:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Hãy đăng nhập đúng tài khoản {requested_email}",
        )

    encrypted = _fernet(settings).encrypt(refresh_token.encode()).decode()
    connection = db.scalar(
        select(models.GoogleCalendarConnection).where(
            models.GoogleCalendarConnection.user_email == requested_email
        )
    )
    if connection is None:
        connection = models.GoogleCalendarConnection(
            user_email=requested_email,
            google_email=google_email,
            encrypted_refresh_token=encrypted,
            calendar_id=settings.google_calendar_id,
            scopes=str(token_data.get("scope") or " ".join(GOOGLE_SCOPES)),
        )
        db.add(connection)
    else:
        connection.google_email = google_email
        connection.encrypted_refresh_token = encrypted
        connection.calendar_id = settings.google_calendar_id
        connection.scopes = str(token_data.get("scope") or " ".join(GOOGLE_SCOPES))
        connection.connected_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(connection)
    return connection


def connection_for(db: Session, email: str) -> models.GoogleCalendarConnection | None:
    return db.scalar(
        select(models.GoogleCalendarConnection).where(
            models.GoogleCalendarConnection.user_email == email.strip().lower()
        )
    )


def connection_status(db: Session, email: str) -> dict:
    settings = get_settings()
    normalized = email.strip().lower()
    missing = missing_settings(settings)
    connection = connection_for(db, normalized) if not missing else None
    return {
        "configured": not missing,
        "connected": connection is not None,
        "user_email": normalized,
        "google_email": connection.google_email if connection else None,
        "connected_at": connection.connected_at if connection else None,
        "missing_settings": missing,
    }


def disconnect(db: Session, email: str) -> None:
    settings = get_settings()
    connection = connection_for(db, email)
    if connection is None:
        return
    try:
        refresh_token = _fernet(settings).decrypt(connection.encrypted_refresh_token.encode()).decode()
        httpx.post(
            GOOGLE_REVOKE_URL,
            data={"token": refresh_token},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=10,
        )
    except Exception:
        logger.warning("Could not revoke Google token for %s", email, exc_info=True)
    db.delete(connection)
    db.commit()


def _access_token(connection: models.GoogleCalendarConnection, settings: Settings) -> str:
    try:
        refresh_token = _fernet(settings).decrypt(connection.encrypted_refresh_token.encode()).decode()
    except InvalidToken as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Không giải mã được Google refresh token; kiểm tra khóa mã hóa",
        ) from exc
    response = httpx.post(GOOGLE_TOKEN_URL, data={
        "client_id": settings.google_client_id,
        "client_secret": settings.google_client_secret,
        "refresh_token": refresh_token,
        "grant_type": "refresh_token",
    }, timeout=20)
    if not response.is_success:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=_google_error(response, "Không làm mới được quyền Google Calendar"),
        )
    token = response.json().get("access_token")
    if not token:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Google không trả access token")
    return str(token)


def _event_payload(meeting: models.Meeting) -> dict:
    room = meeting.booking.room.name if meeting.booking and meeting.booking.room else ""
    return {
        "summary": meeting.title,
        "description": meeting.description or "",
        "location": room,
        "start": {"dateTime": meeting.start_time.isoformat(), "timeZone": "Asia/Ho_Chi_Minh"},
        "end": {"dateTime": meeting.end_time.isoformat(), "timeZone": "Asia/Ho_Chi_Minh"},
        "attendees": [{"email": participant.email} for participant in meeting.participants],
        "extendedProperties": {"private": {"meetingManagementId": str(meeting.id)}},
    }


def sync_meeting(db: Session, meeting: models.Meeting, requester_email: str) -> models.GoogleCalendarEvent:
    normalized = requester_email.strip().lower()
    if meeting.organizer_email != normalized:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Chỉ người tổ chức được đồng bộ lịch Google")
    settings = get_settings()
    _require_configured(settings)
    connection = connection_for(db, normalized)
    if connection is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Tài khoản chưa kết nối Google Calendar")

    mapping = meeting.google_calendar_event
    is_new_mapping = mapping is None
    if mapping is None:
        mapping = models.GoogleCalendarEvent(
            meeting=meeting,
            connection=connection,
            sync_status=models.GoogleSyncStatus.PENDING,
        )
        db.add(mapping)
        db.flush()
    token = _access_token(connection, settings)
    calendar_id = quote(connection.calendar_id, safe="")
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    try:
        if meeting.status == models.MeetingStatus.CANCELLED:
            if mapping.google_event_id:
                event_id = quote(mapping.google_event_id, safe="")
                response = httpx.delete(
                    f"{GOOGLE_CALENDAR_API}/calendars/{calendar_id}/events/{event_id}",
                    params={"sendUpdates": "all"},
                    headers=headers,
                    timeout=20,
                )
                if response.status_code not in {204, 404, 410}:
                    raise RuntimeError(_google_error(response, "Google không thể xóa sự kiện"))
            mapping.sync_status = models.GoogleSyncStatus.DELETED
            mapping.error_message = None
            mapping.synced_at = datetime.now(timezone.utc)
        else:
            params = {"sendUpdates": "all"}
            if is_new_mapping or not mapping.google_event_id:
                # A deterministic Google event id makes create retries
                # idempotent even if the first HTTP response is lost.
                mapping.google_event_id = f"ictumeeting{meeting.id}"
                payload = {"id": mapping.google_event_id, **_event_payload(meeting)}
                response = httpx.post(
                    f"{GOOGLE_CALENDAR_API}/calendars/{calendar_id}/events",
                    params=params,
                    headers=headers,
                    json=payload,
                    timeout=20,
                )
                if response.status_code == 409:
                    event_id = quote(mapping.google_event_id, safe="")
                    response = httpx.put(
                        f"{GOOGLE_CALENDAR_API}/calendars/{calendar_id}/events/{event_id}",
                        params=params,
                        headers=headers,
                        json=_event_payload(meeting),
                        timeout=20,
                    )
            else:
                event_id = quote(mapping.google_event_id, safe="")
                response = httpx.put(
                    f"{GOOGLE_CALENDAR_API}/calendars/{calendar_id}/events/{event_id}",
                    params=params,
                    headers=headers,
                    json=_event_payload(meeting),
                    timeout=20,
                )
            if not response.is_success:
                raise RuntimeError(_google_error(response, "Google không thể đồng bộ sự kiện"))
            data = response.json()
            mapping.google_event_id = str(data["id"])
            mapping.html_link = data.get("htmlLink")
            mapping.sync_status = models.GoogleSyncStatus.SYNCED
            mapping.error_message = None
            mapping.synced_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(mapping)
        return mapping
    except Exception as exc:
        mapping.sync_status = models.GoogleSyncStatus.FAILED
        mapping.error_message = str(exc)[:2000]
        db.commit()
        if isinstance(exc, HTTPException):
            raise
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc


def sync_meeting_if_connected_task(meeting_id: int) -> None:
    from . import services

    with SessionLocal() as db:
        meeting = services.get_meeting_or_404(db, meeting_id)
        if connection_for(db, meeting.organizer_email) is None:
            return
        try:
            sync_meeting(db, meeting, meeting.organizer_email)
        except Exception:
            logger.exception("Google Calendar sync failed for meeting_id=%s", meeting_id)
