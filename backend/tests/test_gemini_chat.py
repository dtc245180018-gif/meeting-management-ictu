import json

from sqlalchemy import func, select

from app import gemini_chat, models
from app.config import Settings
from app.database import SessionLocal


def draft_payload(**overrides):
    payload = {
        "title": None,
        "description": "Đặt lịch qua Gemini",
        "organizer_email": "leader@example.com",
        "start_time": None,
        "end_time": None,
        "participant_emails": [],
        "expected_attendees": None,
        "recurrence": None,
        "recurrence_count": 1,
        "room_id": None,
        "equipment_ids": [],
        "reminder_minutes": 30,
    }
    payload.update(overrides)
    return payload


def test_gemini_status_explains_when_api_key_is_missing(client, monkeypatch):
    monkeypatch.setattr(
        gemini_chat,
        "get_settings",
        lambda: Settings(gemini_api_key="", auth_secret_key="test-secret-key-with-at-least-32-characters"),
    )

    response = client.get("/api/chatbot/ai/status")

    assert response.status_code == 200
    assert response.json()["configured"] is False
    assert response.json()["provider"] == "gemini"
    assert "Gemini" in response.json()["privacy_notice"]


def test_conversation_updates_draft_without_writing_meeting_data(client, monkeypatch):
    def fake_call(_prompt, _settings):
        return gemini_chat._GeminiTurn(
            reply="Tôi đã hiểu thời gian và số người. Bạn có thể tìm phòng phù hợp.",
            updated_fields=["title", "start_time", "end_time", "expected_attendees"],
            draft=gemini_chat._GeminiDraft(
                title="Họp Sprint 4",
                description="Đặt lịch qua Gemini",
                start_time="2026-10-20T09:00:00+07:00",
                end_time="2026-10-20T10:00:00+07:00",
                participant_emails=[],
                expected_attendees=8,
                recurrence=None,
                recurrence_count=1,
                room_id=None,
                equipment_ids=[],
                reminder_minutes=30,
            ),
        )

    monkeypatch.setattr(gemini_chat, "_call_gemini", fake_call)
    with SessionLocal() as db:
        before = db.scalar(select(func.count(models.Meeting.id)))

    response = client.post(
        "/api/chatbot/conversation",
        json={
            "message": "Đặt phòng cho 8 người ngày 20/10 từ 9 đến 10 giờ",
            "draft": draft_payload(),
            "history": [],
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["provider"] == "gemini"
    assert body["ready_for_preview"] is True
    assert body["missing_fields"] == []
    assert body["draft"]["organizer_email"] == "leader@example.com"
    assert body["draft"]["title"] == "Họp Sprint 4"
    assert body["draft"]["expected_attendees"] == 8
    with SessionLocal() as db:
        assert db.scalar(select(func.count(models.Meeting.id))) == before


def test_conversation_rejects_hallucinated_room_and_preserves_untouched_fields(client, monkeypatch):
    def fake_call(_prompt, _settings):
        return gemini_chat._GeminiTurn(
            reply="Tôi đã đổi tên và chọn phòng.",
            updated_fields=["title", "room_id"],
            draft=gemini_chat._GeminiDraft(
                title="Tên mới",
                description=None,
                start_time="2026-10-20T09:00:00+07:00",
                end_time="2026-10-20T10:00:00+07:00",
                participant_emails=[],
                expected_attendees=5,
                recurrence=None,
                recurrence_count=1,
                room_id=999999,
                equipment_ids=[],
                reminder_minutes=30,
            ),
        )

    monkeypatch.setattr(gemini_chat, "_call_gemini", fake_call)
    response = client.post(
        "/api/chatbot/conversation",
        json={
            "message": "Đổi tên thành Tên mới và chọn phòng không có thật",
            "draft": draft_payload(
                title="Tên cũ",
                start_time="2026-10-21T09:00:00+07:00",
                end_time="2026-10-21T10:00:00+07:00",
                expected_attendees=5,
            ),
            "history": [],
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["draft"]["title"] == "Tên mới"
    assert body["draft"]["start_time"] == "2026-10-21T09:00:00+07:00"
    assert body["draft"]["room_id"] is None
    assert "không tồn tại" in body["reply"]


def test_gemini_request_uses_backend_key_structured_output_and_no_storage(monkeypatch):
    captured = {}
    output = {
        "reply": "Bạn muốn cuộc họp bắt đầu lúc nào?",
        "updated_fields": ["title"],
        "draft": {
            "title": "Họp nhóm",
            "description": None,
            "start_time": None,
            "end_time": None,
            "participant_emails": [],
            "expected_attendees": None,
            "recurrence": None,
            "recurrence_count": 1,
            "room_id": None,
            "equipment_ids": [],
            "reminder_minutes": 30,
        },
    }

    class FakeResponse:
        status_code = 200

        def raise_for_status(self):
            return None

        def json(self):
            return {"output_text": json.dumps(output)}

    class FakeClient:
        def __init__(self, timeout):
            captured["timeout"] = timeout

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return None

        def post(self, url, headers, json):
            captured.update({"url": url, "headers": headers, "payload": json})
            return FakeResponse()

    monkeypatch.setattr(gemini_chat.httpx, "Client", FakeClient)
    turn = gemini_chat._call_gemini(
        "Tin nhắn thử nghiệm",
        Settings(
            gemini_api_key="private-test-key",
            gemini_model="gemini-3.8-flash",
            auth_secret_key="test-secret-key-with-at-least-32-characters",
        ),
    )

    assert turn.draft.title == "Họp nhóm"
    assert captured["headers"]["x-goog-api-key"] == "private-test-key"
    assert captured["payload"]["store"] is False
    assert captured["payload"]["response_format"]["mime_type"] == "application/json"


def test_extract_output_text_supports_interactions_steps_response():
    output = {
        "reply": "Bạn muốn cuộc họp bắt đầu lúc nào?",
        "updated_fields": ["title"],
        "draft": {
            "title": "Họp Sprint 4",
            "description": None,
            "start_time": None,
            "end_time": None,
            "participant_emails": [],
            "expected_attendees": None,
            "recurrence": None,
            "recurrence_count": 1,
            "room_id": None,
            "equipment_ids": [],
            "reminder_minutes": 30,
        },
    }
    payload = {
        "status": "completed",
        "steps": [
            {"type": "thought", "signature": "opaque"},
            {
                "type": "model_output",
                "content": [{"type": "text", "text": json.dumps(output)}],
            },
        ],
    }

    extracted = gemini_chat._extract_output_text(payload)

    assert extracted is not None
    assert json.loads(extracted) == output
