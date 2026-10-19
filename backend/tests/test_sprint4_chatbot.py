from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select

from app import models
from app.database import SessionLocal
from app.passwords import hash_password


PASSWORD = "ICTU123"


def future_time(days: int = 3, hour: int = 9) -> datetime:
    value = datetime.now(timezone.utc) + timedelta(days=days)
    return value.replace(hour=hour, minute=0, second=0, microsecond=0)


def chatbot_draft(**overrides) -> dict:
    start = overrides.pop("start_time", future_time())
    draft = {
        "title": "Họp qua chatbot",
        "description": "Kiểm thử US25",
        "organizer_email": "chatbot.organizer@ictu.edu.vn",
        "start_time": start.isoformat(),
        "end_time": (start + timedelta(hours=1)).isoformat(),
        "participant_emails": ["chatbot.member@ictu.edu.vn"],
        "expected_attendees": 3,
        "recurrence": None,
        "recurrence_count": 1,
        "room_id": None,
        "equipment_ids": [],
        "reminder_minutes": 30,
    }
    draft.update(overrides)
    return draft


def create_account(email: str, role: models.AccountRole) -> None:
    with SessionLocal() as db:
        employee = models.Employee(
            full_name=email.split("@", 1)[0],
            email=email,
            department="Sprint 4",
            is_active=True,
        )
        db.add(
            models.UserAccount(
                employee=employee,
                email=email,
                password_hash=hash_password(PASSWORD),
                role=role,
                must_change_password=False,
                is_active=True,
            )
        )
        db.commit()


def login(client, email: str) -> dict[str, str]:
    response = client.post(
        "/api/auth/login",
        json={"email": email, "password": PASSWORD},
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def meeting_count() -> int:
    with SessionLocal() as db:
        return db.scalar(select(func.count(models.Meeting.id))) or 0


def test_chatbot_collects_missing_fields_previews_and_confirms_atomically(client):
    incomplete = client.post(
        "/api/chatbot/bookings/preview",
        json={"organizer_email": "chatbot.organizer@ictu.edu.vn"},
    )
    assert incomplete.status_code == 200
    assert incomplete.json()["ready_to_confirm"] is False
    assert incomplete.json()["missing_fields"] == [
        "title",
        "start_time",
        "end_time",
        "expected_attendees",
    ]
    assert meeting_count() == 0

    room_preview = client.post(
        "/api/chatbot/bookings/preview",
        json=chatbot_draft(),
    )
    assert room_preview.status_code == 200, room_preview.text
    assert room_preview.json()["ready_to_confirm"] is False
    assert room_preview.json()["missing_fields"] == ["room_id"]
    assert room_preview.json()["room_options"]
    assert meeting_count() == 0

    room_id = room_preview.json()["room_options"][0]["id"]
    confirmation = client.post(
        "/api/chatbot/bookings/preview",
        json=chatbot_draft(room_id=room_id),
    )
    assert confirmation.status_code == 200, confirmation.text
    body = confirmation.json()
    assert body["ready_to_confirm"] is True
    assert body["confirmation_token"]
    assert body["expires_at"]
    assert "Họp qua chatbot" in body["summary"]
    assert meeting_count() == 0

    created = client.post(
        "/api/chatbot/bookings/confirm",
        json={"confirmation_token": body["confirmation_token"]},
    )
    assert created.status_code == 201, created.text
    assert created.json()["message"] == "Đã tạo 1 lịch họp và đặt phòng thành công."
    assert created.json()["meetings"][0]["booking"]["room_id"] == room_id
    assert meeting_count() == 1

    replay = client.post(
        "/api/chatbot/bookings/confirm",
        json={"confirmation_token": body["confirmation_token"]},
    )
    assert replay.status_code == 409
    assert meeting_count() == 1


def test_chatbot_rejects_tampered_confirmation_without_writing_data(client):
    preview = client.post(
        "/api/chatbot/bookings/preview",
        json=chatbot_draft(),
    ).json()
    room_id = preview["room_options"][0]["id"]
    confirmation = client.post(
        "/api/chatbot/bookings/preview",
        json=chatbot_draft(room_id=room_id),
    ).json()
    token = confirmation["confirmation_token"]
    replacement = "a" if token[-1] != "a" else "b"

    response = client.post(
        "/api/chatbot/bookings/confirm",
        json={"confirmation_token": token[:-1] + replacement},
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "Mã xác nhận chatbot không hợp lệ"
    assert meeting_count() == 0


def test_chatbot_rechecks_room_at_confirmation_and_never_creates_partial_data(client):
    draft = chatbot_draft(start_time=future_time(days=4))
    room_preview = client.post(
        "/api/chatbot/bookings/preview",
        json=draft,
    ).json()
    room_id = room_preview["room_options"][0]["id"]
    draft["room_id"] = room_id
    confirmation = client.post(
        "/api/chatbot/bookings/preview",
        json=draft,
    ).json()

    blocker = {
        **draft,
        "title": "Lịch chặn sau preview",
        "organizer_email": "blocker@ictu.edu.vn",
        "participant_emails": [],
        "expected_attendees": 1,
        "reminder_minutes": None,
    }
    occupied = client.post("/api/meetings", json=blocker)
    assert occupied.status_code == 201, occupied.text

    response = client.post(
        "/api/chatbot/bookings/confirm",
        json={"confirmation_token": confirmation["confirmation_token"]},
    )

    assert response.status_code == 409
    assert response.json()["detail"] == "Phòng đã được đặt trong khung giờ này"
    assert meeting_count() == 1


def test_chatbot_room_options_cover_every_recurrence(client):
    start = future_time(days=5)
    rooms = client.get("/api/rooms").json()
    blocked_room = rooms[0]
    blocker = chatbot_draft(
        title="Chặn tuần thứ hai",
        organizer_email="blocker@ictu.edu.vn",
        participant_emails=[],
        expected_attendees=1,
        start_time=start + timedelta(weeks=1),
        room_id=blocked_room["id"],
        reminder_minutes=None,
    )
    assert client.post("/api/meetings", json=blocker).status_code == 201

    recurring = chatbot_draft(
        start_time=start,
        recurrence="weekly",
        recurrence_count=2,
        expected_attendees=1,
        participant_emails=[],
    )
    preview = client.post(
        "/api/chatbot/bookings/preview",
        json=recurring,
    )
    assert preview.status_code == 200, preview.text
    option_ids = {room["id"] for room in preview.json()["room_options"]}
    assert blocked_room["id"] not in option_ids

    rejected = client.post(
        "/api/chatbot/bookings/preview",
        json={**recurring, "room_id": blocked_room["id"]},
    )
    assert rejected.status_code == 409
    assert meeting_count() == 1


def test_chatbot_uses_authenticated_identity_and_enforces_rbac(client):
    organizer_email = "sprint4.organizer@ictu.edu.vn"
    participant_email = "sprint4.participant@ictu.edu.vn"
    create_account(organizer_email, models.AccountRole.ORGANIZER)
    create_account(participant_email, models.AccountRole.PARTICIPANT)
    organizer_headers = login(client, organizer_email)
    participant_headers = login(client, participant_email)

    denied = client.post(
        "/api/chatbot/bookings/preview",
        headers=participant_headers,
        json=chatbot_draft(),
    )
    assert denied.status_code == 403

    first = client.post(
        "/api/chatbot/bookings/preview",
        headers=organizer_headers,
        json=chatbot_draft(organizer_email="spoofed@ictu.edu.vn"),
    )
    assert first.status_code == 200, first.text
    assert first.json()["draft"]["organizer_email"] == organizer_email
    room_id = first.json()["room_options"][0]["id"]
    confirmation = client.post(
        "/api/chatbot/bookings/preview",
        headers=organizer_headers,
        json=chatbot_draft(
            organizer_email="spoofed@ictu.edu.vn",
            room_id=room_id,
        ),
    )
    assert confirmation.status_code == 200, confirmation.text

    wrong_account = client.post(
        "/api/chatbot/bookings/confirm",
        headers=participant_headers,
        json={"confirmation_token": confirmation.json()["confirmation_token"]},
    )
    assert wrong_account.status_code == 403
    assert meeting_count() == 0

    created = client.post(
        "/api/chatbot/bookings/confirm",
        headers=organizer_headers,
        json={"confirmation_token": confirmation.json()["confirmation_token"]},
    )
    assert created.status_code == 201, created.text
    assert created.json()["meetings"][0]["organizer_email"] == organizer_email
