from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock
from urllib.parse import parse_qs, urlparse

from app import models, reminders
from app.database import SessionLocal
from app.reminders import process_due_reminders


ADMIN = "leader@example.com"


def future_time(days: int = 20, hour: int = 9) -> datetime:
    value = datetime.now(timezone.utc) + timedelta(days=days)
    return value.replace(hour=hour, minute=0, second=0, microsecond=0)


def meeting_payload(**overrides):
    start = overrides.pop("start_time", future_time())
    payload = {
        "title": "Họp Sprint 2",
        "description": "Kiểm thử tài nguyên Sprint 2",
        "organizer_email": ADMIN,
        "start_time": start.isoformat(),
        "end_time": (start + timedelta(hours=1)).isoformat(),
        "participant_emails": ["employee.one@example.com"],
        "expected_attendees": 2,
        "recurrence": None,
        "recurrence_count": 1,
    }
    payload.update(overrides)
    return payload


def equipment_by_code(client, code: str):
    return next(item for item in client.get("/api/equipment").json() if item["code"] == code)


def test_us09_cancel_releases_room_equipment_and_is_idempotent(client):
    start = future_time(days=21)
    room = client.get("/api/rooms/available", params={
        "start_time": start.isoformat(), "end_time": (start + timedelta(hours=1)).isoformat(), "min_capacity": 2,
    }).json()[0]
    equipment = equipment_by_code(client, "TB-MC-01")
    created = client.post("/api/meetings", json=meeting_payload(
        start_time=start, room_id=room["id"], equipment_ids=[equipment["id"]], reminder_minutes=30,
    )).json()[0]

    denied = client.post(f"/api/meetings/{created['id']}/cancel", json={"requester_email": "other@ictu.edu.vn"})
    assert denied.status_code == 403
    cancelled = client.post(f"/api/meetings/{created['id']}/cancel", json={"requester_email": ADMIN})
    assert cancelled.status_code == 200
    assert cancelled.json()["booking"]["status"] == "cancelled"
    assert cancelled.json()["equipment_bookings"][0]["status"] == "cancelled"
    assert client.post(f"/api/meetings/{created['id']}/cancel", json={"requester_email": ADMIN}).status_code == 200

    available_room_ids = {item["id"] for item in client.get("/api/rooms/available", params={
        "start_time": start.isoformat(), "end_time": (start + timedelta(hours=1)).isoformat(), "min_capacity": 2,
    }).json()}
    available_equipment_ids = {item["id"] for item in client.get("/api/equipment/available", params={
        "start_time": start.isoformat(), "end_time": (start + timedelta(hours=1)).isoformat(),
    }).json()}
    assert room["id"] in available_room_ids
    assert equipment["id"] in available_equipment_ids
    assert all(item["status"] == "cancelled" for item in client.get("/api/notifications", params={"email": ADMIN}).json())


def test_us10_capacity_filter_and_expected_attendee_constraint(client):
    start = future_time(days=22)
    rooms = client.get("/api/rooms/available", params={
        "start_time": start.isoformat(), "end_time": (start + timedelta(hours=1)).isoformat(), "min_capacity": 20,
    })
    assert rooms.status_code == 200
    assert rooms.json() and all(room["capacity"] >= 20 for room in rooms.json())
    invalid = client.post("/api/meetings", json=meeting_payload(
        start_time=start, expected_attendees=1, participant_emails=["a@ictu.edu.vn"],
    ))
    assert invalid.status_code == 422


def test_us11_room_admin_crud_soft_lock_duplicate_and_permission(client):
    payload = {
        "requester_email": ADMIN,
        "name": "Phòng Sprint 2",
        "capacity": 14,
        "location": "Tầng 2 - Khu E",
        "building": "Khu E",
        "floor": 2,
        "room_type": "Phòng họp",
    }
    denied = client.post("/api/admin/rooms", json={**payload, "requester_email": "other@ictu.edu.vn"})
    assert denied.status_code == 403
    created = client.post("/api/admin/rooms", json=payload)
    assert created.status_code == 201
    room = created.json()
    assert client.post("/api/admin/rooms", json=payload).status_code == 409
    assert client.post("/api/admin/rooms", json={**payload, "name": "Sai sức chứa", "capacity": 0}).status_code == 422

    updated = client.patch(f"/api/admin/rooms/{room['id']}", json={
        "requester_email": ADMIN, "capacity": 18, "projector": True,
    })
    assert updated.status_code == 200
    assert updated.json()["capacity"] == 18 and updated.json()["projector"] is True
    locked = client.delete(f"/api/admin/rooms/{room['id']}", params={"requester_email": ADMIN})
    assert locked.status_code == 200 and locked.json()["is_active"] is False
    assert room["id"] not in {item["id"] for item in client.get("/api/rooms").json()}
    assert room["id"] in {item["id"] for item in client.get("/api/admin/rooms", params={"requester_email": ADMIN}).json()}
    assert client.post("/api/meetings", json=meeting_payload(
        title="Không đặt phòng khóa", start_time=future_time(days=40), room_id=room["id"], participant_emails=[], expected_attendees=1,
    )).status_code == 404


def test_us12_multiple_equipment_conflict_and_atomic_rollback(client):
    start = future_time(days=23)
    first = equipment_by_code(client, "TB-MC-01")
    second = equipment_by_code(client, "TB-TV-01")
    rollback_candidate = equipment_by_code(client, "TB-BT-01")
    created = client.post("/api/meetings", json=meeting_payload(
        start_time=start, equipment_ids=[first["id"], second["id"]],
    ))
    assert created.status_code == 201
    assert {item["equipment"]["code"] for item in created.json()[0]["equipment_bookings"]} == {"TB-MC-01", "TB-TV-01"}
    assert client.post("/api/meetings", json=meeting_payload(
        title="Trùng trong request", start_time=start + timedelta(hours=2), participant_emails=[],
        equipment_ids=[first["id"], first["id"]],
    )).status_code == 422

    conflict = client.post("/api/meetings", json=meeting_payload(
        title="Phải rollback", organizer_email="other@ictu.edu.vn", participant_emails=[], expected_attendees=1,
        start_time=start, equipment_ids=[rollback_candidate["id"], first["id"]],
    ))
    assert conflict.status_code == 409
    assert "Phải rollback" not in {item["title"] for item in client.get("/api/meetings").json()}
    assert rollback_candidate["id"] in {item["id"] for item in client.get("/api/equipment/available", params={
        "start_time": start.isoformat(), "end_time": (start + timedelta(hours=1)).isoformat(),
    }).json()}


def test_us12_recurring_equipment_checks_every_occurrence(client):
    start = future_time(days=24)
    equipment = equipment_by_code(client, "TB-MC-02")
    blocker = client.post("/api/meetings", json=meeting_payload(
        title="Chặn tuần hai", organizer_email="blocker@ictu.edu.vn", participant_emails=[], expected_attendees=1,
        start_time=start + timedelta(weeks=1), equipment_ids=[equipment["id"]],
    ))
    assert blocker.status_code == 201
    recurring = client.post("/api/meetings", json=meeting_payload(
        title="Lịch lặp thiết bị", start_time=start, participant_emails=[], expected_attendees=1,
        recurrence="weekly", recurrence_count=2, equipment_ids=[equipment["id"]],
    ))
    assert recurring.status_code == 409
    assert {item["title"] for item in client.get("/api/meetings").json()} == {"Chặn tuần hai"}


def test_us13_equipment_status_is_computed_by_backend(client):
    start = future_time(days=25)
    available = equipment_by_code(client, "TB-MC-01")
    maintenance = equipment_by_code(client, "TB-VC-01")
    assert maintenance["status"] == "maintenance"
    assert client.post("/api/meetings", json=meeting_payload(
        start_time=start, equipment_ids=[maintenance["id"]],
    )).status_code == 409
    client.post("/api/meetings", json=meeting_payload(start_time=start, equipment_ids=[available["id"]]))
    states = client.get("/api/equipment", params={
        "start_time": start.isoformat(), "end_time": (start + timedelta(hours=1)).isoformat(),
    }).json()
    assert next(item for item in states if item["id"] == available["id"])["status"] == "booked"
    assert available["id"] not in {item["id"] for item in client.get("/api/equipment/available", params={
        "start_time": start.isoformat(), "end_time": (start + timedelta(hours=1)).isoformat(),
    }).json()}


def test_us14_equipment_admin_crud_maintenance_inactive_and_permission(client):
    payload = {
        "requester_email": ADMIN,
        "code": "TB-DEMO-01",
        "name": "Thiết bị demo",
        "category": "demo",
        "location": "Kho A",
    }
    assert client.post("/api/admin/equipment", json={**payload, "requester_email": "other@ictu.edu.vn"}).status_code == 403
    created = client.post("/api/admin/equipment", json=payload)
    assert created.status_code == 201
    item = created.json()
    assert client.post("/api/admin/equipment", json=payload).status_code == 409
    maintenance = client.patch(f"/api/admin/equipment/{item['id']}", json={
        "requester_email": ADMIN, "status": "maintenance", "location": "Xưởng sửa chữa",
    })
    assert maintenance.status_code == 200 and maintenance.json()["status"] == "maintenance"
    reactivated = client.patch(f"/api/admin/equipment/{item['id']}", json={
        "requester_email": ADMIN, "status": "available",
    })
    assert reactivated.status_code == 200 and reactivated.json()["is_active"] is True
    locked = client.delete(f"/api/admin/equipment/{item['id']}", params={"requester_email": ADMIN})
    assert locked.status_code == 200 and locked.json()["status"] == "inactive"
    assert client.post("/api/meetings", json=meeting_payload(
        title="Không đặt thiết bị khóa", start_time=future_time(days=41), equipment_ids=[item["id"]],
    )).status_code == 409


def test_us14_cannot_maintain_equipment_in_use_now(client):
    equipment = equipment_by_code(client, "TB-MIC-01")
    start = datetime.now(timezone.utc) - timedelta(minutes=15)
    created = client.post("/api/meetings", json=meeting_payload(
        start_time=start,
        end_time=(start + timedelta(hours=1)).isoformat(),
        equipment_ids=[equipment["id"]],
    ))
    assert created.status_code == 201
    response = client.patch(f"/api/admin/equipment/{equipment['id']}", json={
        "requester_email": ADMIN, "status": "maintenance",
    })
    assert response.status_code == 409


def test_us12_update_time_rechecks_equipment_conflict(client):
    equipment = equipment_by_code(client, "TB-BT-01")
    first_time = future_time(days=26)
    second_time = first_time + timedelta(hours=3)
    client.post("/api/meetings", json=meeting_payload(start_time=first_time, equipment_ids=[equipment["id"]]))
    second = client.post("/api/meetings", json=meeting_payload(
        title="Cuộc họp thứ hai", organizer_email="other@ictu.edu.vn", participant_emails=[], expected_attendees=1,
        start_time=second_time, equipment_ids=[equipment["id"]],
    )).json()[0]
    response = client.patch(f"/api/meetings/{second['id']}", json={
        "requester_email": "other@ictu.edu.vn",
        "start_time": first_time.isoformat(),
        "end_time": (first_time + timedelta(hours=1)).isoformat(),
    })
    assert response.status_code == 409


def test_us15_ics_and_calendar_links_include_complete_data_and_cancelled_state(client):
    start = future_time(days=27)
    room = client.get("/api/rooms").json()[1]
    meeting = client.post("/api/meetings", json=meeting_payload(
        title="Họp kế hoạch tiếng Việt", start_time=start, room_id=room["id"],
    )).json()[0]
    links = client.get(f"/api/meetings/{meeting['id']}/calendar-links")
    assert links.status_code == 200
    assert "calendar.google.com" in links.json()["google_url"]
    google_params = parse_qs(urlparse(links.json()["google_url"]).query)
    assert google_params["add"] == ["employee.one@example.com"]
    assert links.json()["outlook_ics_url"].endswith(f"/{meeting['id']}/calendar.ics")
    calendar = client.get(f"/api/meetings/{meeting['id']}/calendar.ics")
    assert calendar.status_code == 200
    assert "text/calendar" in calendar.headers["content-type"]
    assert f"UID:meeting-{meeting['id']}@meeting-management-ictu" in calendar.text
    assert "Họp kế hoạch tiếng Việt" in calendar.text
    assert f"LOCATION:{room['name']}" in calendar.text
    assert "ORGANIZER:mailto:leader@example.com" in calendar.text
    assert "ATTENDEE:mailto:employee.one@example.com" in calendar.text
    assert "SEQUENCE:" in calendar.text
    initial_sequence = int(next(line.split(":", 1)[1] for line in calendar.text.splitlines() if line.startswith("SEQUENCE:")))

    updated_calendar = client.patch(f"/api/meetings/{meeting['id']}", json={
        "requester_email": ADMIN,
        "title": "Họp kế hoạch tiếng Việt đã cập nhật",
    })
    assert updated_calendar.status_code == 200
    revised = client.get(f"/api/meetings/{meeting['id']}/calendar.ics").text
    revised_sequence = int(next(line.split(":", 1)[1] for line in revised.splitlines() if line.startswith("SEQUENCE:")))
    assert f"UID:meeting-{meeting['id']}@meeting-management-ictu" in revised
    assert revised_sequence > initial_sequence

    client.post(f"/api/meetings/{meeting['id']}/cancel", json={"requester_email": ADMIN})
    cancelled = client.get(f"/api/meetings/{meeting['id']}/calendar.ics").text
    assert "METHOD:CANCEL" in cancelled and "STATUS:CANCELLED" in cancelled
    assert f"UID:meeting-{meeting['id']}@meeting-management-ictu" in cancelled


def test_us16_reminders_create_reschedule_cancel_read_and_do_not_send_cancelled(client):
    start = future_time(days=28)
    meeting = client.post("/api/meetings", json=meeting_payload(
        start_time=start, reminder_minutes=60,
    )).json()[0]
    organizer_notifications = client.get("/api/notifications", params={"email": ADMIN}).json()
    participant_notifications = client.get("/api/notifications", params={"email": "EMPLOYEE.ONE@EXAMPLE.COM"}).json()
    organizer_reminders = [item for item in organizer_notifications if item["kind"] == "reminder"]
    participant_reminders = [item for item in participant_notifications if item["kind"] == "reminder"]
    assert len(organizer_reminders) == 1 and len(participant_reminders) == 1
    assert len([item for item in participant_notifications if item["kind"] == "invitation"]) == 1
    original_remind_at = organizer_reminders[0]["remind_at"]

    new_start = start + timedelta(hours=2)
    updated = client.patch(f"/api/meetings/{meeting['id']}", json={
        "requester_email": ADMIN,
        "start_time": new_start.isoformat(),
        "end_time": (new_start + timedelta(hours=1)).isoformat(),
    })
    assert updated.status_code == 200
    changed = next(
        item for item in client.get("/api/notifications", params={"email": ADMIN}).json()
        if item["kind"] == "reminder"
    )
    assert changed["remind_at"] != original_remind_at

    forbidden_read = client.post(f"/api/notifications/{changed['id']}/read", json={"email": "other@ictu.edu.vn"})
    assert forbidden_read.status_code == 403
    marked = client.post(f"/api/notifications/{changed['id']}/read", json={"email": ADMIN})
    assert marked.status_code == 200 and marked.json()["is_read"] is True

    client.post(f"/api/meetings/{meeting['id']}/cancel", json={"requester_email": ADMIN})
    with SessionLocal() as db:
        reminder = db.get(models.Reminder, changed["id"])
        assert reminder.status == models.NotificationStatus.CANCELLED
        reminder.remind_at = datetime.now(timezone.utc) - timedelta(minutes=1)
        db.commit()
        assert process_due_reminders(db) == 0
        assert db.get(models.Reminder, reminder.id).status == models.NotificationStatus.CANCELLED


def test_datetime_is_normalized_to_utc_for_sqlite_calendar_and_reminders(client):
    meeting = client.post("/api/meetings", json=meeting_payload(
        start_time=datetime(2026, 10, 3, 9, tzinfo=timezone(timedelta(hours=7))),
        end_time="2026-10-03T10:00:00+07:00",
        reminder_minutes=60,
    ))
    assert meeting.status_code == 201
    created = meeting.json()[0]
    assert datetime.fromisoformat(created["start_time"].replace("Z", "+00:00")) == datetime(2026, 10, 3, 2, tzinfo=timezone.utc)
    notification = client.get("/api/notifications", params={"email": ADMIN}).json()[0]
    assert datetime.fromisoformat(notification["remind_at"].replace("Z", "+00:00")) == datetime(2026, 10, 3, 1, tzinfo=timezone.utc)

    calendar = client.get(f"/api/meetings/{created['id']}/calendar.ics").text
    assert "DTSTART:20261003T020000Z" in calendar
    google = client.get(f"/api/meetings/{created['id']}/calendar-links").json()["google_url"]
    assert parse_qs(urlparse(google).query)["dates"][0].startswith("20261003T020000Z/")


def test_reminder_can_be_disabled_and_reenabled_without_duplicates(client):
    start = future_time(days=29)
    meeting = client.post("/api/meetings", json=meeting_payload(
        start_time=start,
        reminder_minutes=60,
    )).json()[0]
    endpoint = f"/api/meetings/{meeting['id']}"
    assert client.patch(endpoint, json={"requester_email": ADMIN, "reminder_minutes": None}).status_code == 200
    assert client.patch(endpoint, json={"requester_email": ADMIN, "reminder_minutes": 60}).status_code == 200

    with SessionLocal() as db:
        items = list(db.query(models.Reminder).filter(
            models.Reminder.meeting_id == meeting["id"],
            models.Reminder.kind == models.NotificationKind.REMINDER,
        ).all())
        keys = {(item.recipient_email, item.remind_at) for item in items}
        assert len(keys) == len(items)
        assert all(item.status == models.NotificationStatus.PENDING for item in items)
        assert all(item.attempts == 0 and item.error_message is None and item.sent_at is None for item in items)

    assert client.patch(endpoint, json={"requester_email": ADMIN, "reminder_minutes": None}).status_code == 200
    changed = client.patch(endpoint, json={
        "requester_email": ADMIN,
        "reminder_minutes": 30,
        "participant_emails": ["other@ictu.edu.vn"],
        "start_time": (start + timedelta(hours=2)).isoformat(),
        "end_time": (start + timedelta(hours=3)).isoformat(),
    })
    assert changed.status_code == 200
    with SessionLocal() as db:
        items = list(db.query(models.Reminder).filter(
            models.Reminder.meeting_id == meeting["id"],
            models.Reminder.kind == models.NotificationKind.REMINDER,
        ).all())
        keys = {(item.recipient_email, item.remind_at) for item in items}
        assert len(keys) == len(items)
        pending_recipients = {item.recipient_email for item in items if item.status == models.NotificationStatus.PENDING}
        assert pending_recipients == {ADMIN, "other@ictu.edu.vn"}


def test_smtp_backend_formats_email_in_ictu_timezone(client, monkeypatch):
    meeting = client.post("/api/meetings", json=meeting_payload(
        start_time=datetime(2026, 10, 3, 2, tzinfo=timezone.utc),
        end_time="2026-10-03T03:00:00Z",
        reminder_minutes=60,
    )).json()[0]
    smtp_instance = MagicMock()
    smtp_instance.__enter__.return_value = smtp_instance
    smtp_factory = MagicMock(return_value=smtp_instance)
    monkeypatch.setattr(reminders.smtplib, "SMTP", smtp_factory)
    monkeypatch.setattr(reminders, "get_settings", lambda: SimpleNamespace(
        email_backend="smtp",
        smtp_host="smtp.example.test",
        smtp_port=587,
        smtp_from_email="noreply@ictu.edu.vn",
        smtp_use_tls=True,
        smtp_username="",
        smtp_password="",
    ))

    with SessionLocal() as db:
        item = db.query(models.Reminder).filter(models.Reminder.meeting_id == meeting["id"]).first()
        reminders._send_email(item)

    smtp_instance.starttls.assert_called_once()
    message = smtp_instance.send_message.call_args.args[0]
    body = message.get_content()
    assert "09:00 ngày 03/10/2026" in body
    assert "Asia/Ho_Chi_Minh" in body
