from __future__ import annotations

from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qs, urlparse

from cryptography.fernet import Fernet

from app import api as api_module
from app import google_calendar, models
from app.config import Settings
from app.database import SessionLocal


ORGANIZER = "leader@example.com"
PARTICIPANT = "employee.one@example.com"


def future_start() -> datetime:
    return (datetime.now(timezone.utc) + timedelta(days=70)).replace(
        hour=2, minute=0, second=0, microsecond=0
    )


def payload(**overrides):
    start = overrides.pop("start_time", future_start())
    data = {
        "title": "Họp tích hợp thật",
        "description": "Kiểm tra email và Google Calendar",
        "organizer_email": ORGANIZER,
        "start_time": start.isoformat(),
        "end_time": (start + timedelta(hours=1)).isoformat(),
        "participant_emails": [PARTICIPANT],
        "expected_attendees": 2,
        "recurrence": None,
        "recurrence_count": 1,
    }
    data.update(overrides)
    return data


def google_settings(key: str) -> Settings:
    return Settings(
        _env_file=None,
        google_client_id="client-id.apps.googleusercontent.com",
        google_client_secret="client-secret",
        google_redirect_uri="http://localhost:8000/api/integrations/google/callback",
        google_token_encryption_key=key,
        google_oauth_state_secret="state-secret-with-enough-randomness",
        google_calendar_id="primary",
    )


class FakeResponse:
    def __init__(self, status_code: int, data: dict | None = None):
        self.status_code = status_code
        self._data = data or {}

    @property
    def is_success(self):
        return 200 <= self.status_code < 300

    def json(self):
        return self._data


def test_invitation_response_update_cancel_and_email_delivery_are_visible(client):
    integration = client.get("/api/integrations/email/status")
    assert integration.status_code == 200
    assert integration.json()["backend"] == "console"
    assert integration.json()["configured"] is False

    created = client.post("/api/meetings", json=payload())
    assert created.status_code == 201
    meeting = created.json()[0]

    participant_notifications = client.get(
        "/api/notifications", params={"email": PARTICIPANT}
    ).json()
    invitation = next(item for item in participant_notifications if item["kind"] == "invitation")
    assert invitation["status"] == "sent"
    assert invitation["subject"] == "Lời mời họp: Họp tích hợp thật"
    assert "chấp nhận hoặc từ chối" in invitation["body"]

    denied = client.post(
        f"/api/meetings/{meeting['id']}/invitations/respond",
        json={"email": "outsider@example.com", "status": "accepted"},
    )
    assert denied.status_code == 403
    accepted = client.post(
        f"/api/meetings/{meeting['id']}/invitations/respond",
        json={"email": PARTICIPANT, "status": "accepted"},
    )
    assert accepted.status_code == 200
    assert accepted.json()["participants"][0]["status"] == "accepted"
    organizer_notifications = client.get(
        "/api/notifications", params={"email": ORGANIZER}
    ).json()
    response = next(item for item in organizer_notifications if item["kind"] == "invitation_response")
    assert response["status"] == "sent"
    assert PARTICIPANT in response["body"]

    updated = client.patch(
        f"/api/meetings/{meeting['id']}",
        json={"requester_email": ORGANIZER, "title": "Họp tích hợp đã đổi"},
    )
    assert updated.status_code == 200
    kinds = {
        item["kind"]
        for item in client.get("/api/notifications", params={"email": PARTICIPANT}).json()
    }
    assert "meeting_updated" in kinds

    cancelled = client.post(
        f"/api/meetings/{meeting['id']}/cancel",
        json={"requester_email": ORGANIZER},
    )
    assert cancelled.status_code == 200
    notifications = client.get("/api/notifications", params={"email": PARTICIPANT}).json()
    cancellation = next(item for item in notifications if item["kind"] == "meeting_cancelled")
    assert cancellation["status"] == "sent"


def test_google_connect_url_requests_offline_calendar_event_access(client, monkeypatch):
    key = Fernet.generate_key().decode()
    settings = google_settings(key)
    monkeypatch.setattr(google_calendar, "get_settings", lambda: settings)

    status = client.get("/api/integrations/google/status", params={"email": ORGANIZER})
    assert status.status_code == 200
    assert status.json()["configured"] is True
    assert status.json()["connected"] is False

    connect = client.get("/api/integrations/google/connect", params={"email": ORGANIZER})
    assert connect.status_code == 200
    parsed = parse_qs(urlparse(connect.json()["authorization_url"]).query)
    assert parsed["access_type"] == ["offline"]
    assert parsed["prompt"] == ["consent"]
    assert parsed["login_hint"] == [ORGANIZER]
    assert "https://www.googleapis.com/auth/calendar.events" in parsed["scope"][0]
    assert parsed["state"][0]


def test_google_oauth_callback_verifies_account_and_encrypts_refresh_token(client, monkeypatch):
    key = Fernet.generate_key().decode()
    settings = google_settings(key)
    monkeypatch.setattr(google_calendar, "get_settings", lambda: settings)
    monkeypatch.setattr(api_module, "get_settings", lambda: settings)

    class OAuthClient:
        def __init__(self, **_kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def post(self, url, **_kwargs):
            assert url == google_calendar.GOOGLE_TOKEN_URL
            return FakeResponse(200, {
                "access_token": "oauth-access",
                "refresh_token": "oauth-refresh-secret",
                "scope": " ".join(google_calendar.GOOGLE_SCOPES),
            })

        def get(self, url, **_kwargs):
            assert url == google_calendar.GOOGLE_USERINFO_URL
            return FakeResponse(200, {"email": ORGANIZER, "email_verified": True})

    monkeypatch.setattr(google_calendar.httpx, "Client", OAuthClient)
    connect = client.get("/api/integrations/google/connect", params={"email": ORGANIZER}).json()
    state_value = parse_qs(urlparse(connect["authorization_url"]).query)["state"][0]
    callback = client.get(
        "/api/integrations/google/callback",
        params={"code": "one-time-code", "state": state_value},
        follow_redirects=False,
    )
    assert callback.status_code == 303
    assert callback.headers["location"].startswith("http://localhost:5173?google_calendar=connected")

    with SessionLocal() as db:
        connection = google_calendar.connection_for(db, ORGANIZER)
        assert connection is not None
        assert connection.encrypted_refresh_token != "oauth-refresh-secret"
        assert Fernet(key.encode()).decrypt(connection.encrypted_refresh_token.encode()) == b"oauth-refresh-secret"

    status_response = client.get("/api/integrations/google/status", params={"email": ORGANIZER})
    assert status_response.json()["connected"] is True
    assert status_response.json()["google_email"] == ORGANIZER


def test_google_event_is_created_updated_and_deleted_with_attendee_notifications(client, monkeypatch):
    key = Fernet.generate_key().decode()
    settings = google_settings(key)
    monkeypatch.setattr(google_calendar, "get_settings", lambda: settings)

    meeting = client.post("/api/meetings", json=payload()).json()[0]
    with SessionLocal() as db:
        db.add(models.GoogleCalendarConnection(
            user_email=ORGANIZER,
            google_email=ORGANIZER,
            encrypted_refresh_token=Fernet(key.encode()).encrypt(b"refresh-token").decode(),
            calendar_id="primary",
            scopes=" ".join(google_calendar.GOOGLE_SCOPES),
        ))
        db.commit()

    calls: list[tuple[str, dict]] = []

    def fake_post(url, **kwargs):
        if url == google_calendar.GOOGLE_TOKEN_URL:
            return FakeResponse(200, {"access_token": "access-token"})
        calls.append(("post", {"url": url, **kwargs}))
        return FakeResponse(200, {
            "id": "google-event-123",
            "htmlLink": "https://calendar.google.com/calendar/event?eid=123",
        })

    def fake_put(url, **kwargs):
        calls.append(("put", {"url": url, **kwargs}))
        return FakeResponse(200, {
            "id": "google-event-123",
            "htmlLink": "https://calendar.google.com/calendar/event?eid=123",
        })

    def fake_delete(url, **kwargs):
        calls.append(("delete", {"url": url, **kwargs}))
        return FakeResponse(204)

    monkeypatch.setattr(google_calendar.httpx, "post", fake_post)
    monkeypatch.setattr(google_calendar.httpx, "put", fake_put)
    monkeypatch.setattr(google_calendar.httpx, "delete", fake_delete)

    synced = client.post(
        f"/api/meetings/{meeting['id']}/google-calendar/sync",
        json={"requester_email": ORGANIZER},
    )
    assert synced.status_code == 200
    assert synced.json()["sync_status"] == "synced"
    creation = next(data for method, data in calls if method == "post")
    assert creation["params"] == {"sendUpdates": "all"}
    assert creation["json"]["attendees"] == [{"email": PARTICIPANT}]
    assert creation["json"]["extendedProperties"]["private"]["meetingManagementId"] == str(meeting["id"])

    updated = client.patch(
        f"/api/meetings/{meeting['id']}",
        json={"requester_email": ORGANIZER, "title": "Tiêu đề Google đã đổi"},
    )
    assert updated.status_code == 200
    update_call = next(data for method, data in calls if method == "put")
    assert update_call["params"] == {"sendUpdates": "all"}
    assert update_call["json"]["summary"] == "Tiêu đề Google đã đổi"

    cancelled = client.post(
        f"/api/meetings/{meeting['id']}/cancel",
        json={"requester_email": ORGANIZER},
    )
    assert cancelled.status_code == 200
    deletion = next(data for method, data in calls if method == "delete")
    assert deletion["params"] == {"sendUpdates": "all"}
    detail = client.get(f"/api/meetings/{meeting['id']}").json()
    assert detail["google_calendar_event"]["sync_status"] == "deleted"
