from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from app import main as app_main
from app import models
from app.database import SessionLocal
from app.main import migrate_employee_emails


LEADER = "leader@example.com"
EMPLOYEE_ONE = "employee.one@example.com"
EMPLOYEE_TWO = "employee.two@example.com"


def acceptance_start() -> datetime:
    return (datetime.now(timezone.utc) + timedelta(days=60)).replace(
        hour=2, minute=0, second=0, microsecond=0
    )


def test_real_users_cover_sprint_1_and_sprint_2_end_to_end(client):
    employees = client.get("/api/employees")
    assert employees.status_code == 200
    employee_emails = {item["email"] for item in employees.json()}
    assert {LEADER, EMPLOYEE_ONE, EMPLOYEE_TWO} <= employee_emails
    assert {
        "leader@ictu.edu.vn",
        "minhanh@ictu.edu.vn",
        "hoangnam@ictu.edu.vn",
    }.isdisjoint(employee_emails)

    start = acceptance_start()
    end = start + timedelta(hours=1)
    available_rooms = client.get(
        "/api/rooms/available",
        params={
            "start_time": start.isoformat(),
            "end_time": end.isoformat(),
            "min_capacity": 3,
        },
    )
    assert available_rooms.status_code == 200
    room = available_rooms.json()[0]
    assert room["capacity"] >= 3

    equipment = client.get(
        "/api/equipment/available",
        params={"start_time": start.isoformat(), "end_time": end.isoformat()},
    )
    assert equipment.status_code == 200
    equipment_ids = [item["id"] for item in equipment.json()[:2]]
    assert len(equipment_ids) == 2

    payload = {
        "title": "Nghiệm thu US01-US16",
        "description": "Luồng thật với ba địa chỉ email nghiệm thu",
        "organizer_email": LEADER,
        "start_time": start.isoformat(),
        "end_time": end.isoformat(),
        "participant_emails": [EMPLOYEE_ONE, EMPLOYEE_TWO],
        "expected_attendees": 3,
        "recurrence": "weekly",
        "recurrence_count": 2,
        "room_id": room["id"],
        "equipment_ids": equipment_ids,
        "reminder_minutes": 60,
    }
    created = client.post("/api/meetings", json=payload)
    assert created.status_code == 201
    meetings = created.json()
    assert len(meetings) == 2
    assert all(item["booking"]["room_id"] == room["id"] for item in meetings)
    assert all(len(item["equipment_bookings"]) == 2 for item in meetings)
    assert all({p["email"] for p in item["participants"]} == {EMPLOYEE_ONE, EMPLOYEE_TWO} for item in meetings)

    conflict = client.post(
        "/api/meetings",
        json={
            **payload,
            "title": "Lịch xung đột",
            "recurrence": None,
            "recurrence_count": 1,
            "room_id": None,
            "equipment_ids": [],
        },
    )
    assert conflict.status_code == 409

    history = client.get("/api/meetings/history", params={"email": EMPLOYEE_ONE})
    assert history.status_code == 200
    assert {item["id"] for item in history.json()} == {item["id"] for item in meetings}

    suggestions = client.post(
        "/api/meetings/suggest-times",
        json={
            "participant_emails": [LEADER, EMPLOYEE_ONE, EMPLOYEE_TWO],
            "range_start": start.replace(hour=1).isoformat(),
            "range_end": start.replace(hour=10).isoformat(),
            "duration_minutes": 60,
            "limit": 3,
        },
    )
    assert suggestions.status_code == 200
    assert all(item["start_time"] != start.isoformat() for item in suggestions.json())

    first = meetings[0]
    denied_update = client.patch(
        f"/api/meetings/{first['id']}",
        json={"requester_email": EMPLOYEE_ONE, "title": "Không được phép"},
    )
    assert denied_update.status_code == 403
    updated = client.patch(
        f"/api/meetings/{first['id']}",
        json={"requester_email": LEADER, "title": "Nghiệm thu US01-US16 đã cập nhật"},
    )
    assert updated.status_code == 200

    calendar = client.get(f"/api/meetings/{first['id']}/calendar.ics")
    assert calendar.status_code == 200
    assert f"ORGANIZER:mailto:{LEADER}" in calendar.text
    assert f"ATTENDEE:mailto:{EMPLOYEE_ONE}" in calendar.text
    assert f"ATTENDEE:mailto:{EMPLOYEE_TWO}" in calendar.text
    links = client.get(f"/api/meetings/{first['id']}/calendar-links")
    assert links.status_code == 200
    assert "calendar.google.com" in links.json()["google_url"]

    leader_notifications = client.get("/api/notifications", params={"email": LEADER}).json()
    employee_one_notifications = client.get("/api/notifications", params={"email": EMPLOYEE_ONE}).json()
    employee_two_notifications = client.get("/api/notifications", params={"email": EMPLOYEE_TWO}).json()
    assert sum(item["kind"] == "reminder" for item in leader_notifications) == 2
    assert sum(item["kind"] == "reminder" for item in employee_one_notifications) == 2
    assert sum(item["kind"] == "invitation" for item in employee_one_notifications) == 2
    assert sum(item["kind"] == "reminder" for item in employee_two_notifications) == 2
    assert sum(item["kind"] == "invitation" for item in employee_two_notifications) == 2

    cancelled = client.post(
        f"/api/meetings/{first['id']}/cancel",
        json={"requester_email": LEADER},
    )
    assert cancelled.status_code == 200
    assert cancelled.json()["status"] == "cancelled"
    assert cancelled.json()["booking"]["status"] == "cancelled"
    assert all(item["status"] == "cancelled" for item in cancelled.json()["equipment_bookings"])
    first_notifications = [
        item
        for item in client.get("/api/notifications", params={"email": EMPLOYEE_ONE}).json()
        if item["meeting_id"] == first["id"]
    ]
    reminders_for_first = [item for item in first_notifications if item["kind"] == "reminder"]
    cancellation_for_first = [item for item in first_notifications if item["kind"] == "meeting_cancelled"]
    assert len(reminders_for_first) == 1 and reminders_for_first[0]["status"] == "cancelled"
    assert len(cancellation_for_first) == 1 and cancellation_for_first[0]["status"] == "sent"


def test_real_leader_has_admin_rights_and_employees_do_not(client):
    room_payload = {
        "name": "Phòng nghiệm thu thật",
        "capacity": 12,
        "location": "Khu A",
        "building": "Khu A",
        "floor": 2,
        "room_type": "Phòng họp",
    }
    assert client.post(
        "/api/admin/rooms",
        json={"requester_email": EMPLOYEE_ONE, **room_payload},
    ).status_code == 403
    room = client.post(
        "/api/admin/rooms",
        json={"requester_email": LEADER, **room_payload},
    )
    assert room.status_code == 201
    assert client.delete(
        f"/api/admin/rooms/{room.json()['id']}", params={"requester_email": LEADER}
    ).status_code == 200

    equipment_payload = {
        "code": "TB-NGHIEM-THU-01",
        "name": "Thiết bị nghiệm thu",
        "category": "display",
        "location": "Kho thiết bị",
    }
    assert client.post(
        "/api/admin/equipment",
        json={"requester_email": EMPLOYEE_TWO, **equipment_payload},
    ).status_code == 403
    equipment = client.post(
        "/api/admin/equipment",
        json={"requester_email": LEADER, **equipment_payload},
    )
    assert equipment.status_code == 201
    equipment_id = equipment.json()["id"]
    maintenance = client.patch(
        f"/api/admin/equipment/{equipment_id}",
        json={"requester_email": LEADER, "status": "maintenance"},
    )
    assert maintenance.status_code == 200
    assert maintenance.json()["status"] == "maintenance"
    assert client.delete(
        f"/api/admin/equipment/{equipment_id}", params={"requester_email": LEADER}
    ).status_code == 200


def test_existing_database_references_are_migrated_to_real_emails(client):
    start = acceptance_start()
    with SessionLocal() as db:
        meeting = models.Meeting(
            title="Dữ liệu cũ cần chuyển email",
            organizer_email="leader@ictu.edu.vn",
            expected_attendees=3,
            start_time=start,
            end_time=start + timedelta(hours=1),
            participants=[
                models.Participant(email="minhanh@ictu.edu.vn"),
                models.Participant(email="hoangnam@ictu.edu.vn"),
            ],
        )
        db.add(meeting)
        db.flush()
        db.add_all([
            models.Reminder(
                meeting_id=meeting.id,
                recipient_email="leader@ictu.edu.vn",
                remind_at=start - timedelta(hours=1),
            ),
            models.Reminder(
                meeting_id=meeting.id,
                recipient_email="minhanh@ictu.edu.vn",
                remind_at=start - timedelta(hours=1),
            ),
            models.Reminder(
                meeting_id=meeting.id,
                recipient_email="hoangnam@ictu.edu.vn",
                remind_at=start - timedelta(hours=1),
            ),
        ])
        db.commit()
        meeting_id = meeting.id

    migrate_employee_emails()

    with SessionLocal() as db:
        migrated = db.get(models.Meeting, meeting_id)
        assert migrated.organizer_email == LEADER
        assert {item.email for item in migrated.participants} == {EMPLOYEE_ONE, EMPLOYEE_TWO}
        assert {item.recipient_email for item in migrated.reminders} == {
            LEADER,
            EMPLOYEE_ONE,
            EMPLOYEE_TWO,
        }


def test_example_defaults_are_migrated_when_real_accounts_are_configured(client, monkeypatch):
    real_leader = "real.leader@ictu.edu.vn"
    real_employee_one = "real.employee.one@gmail.com"
    real_employee_two = "real.employee.two@gmail.com"
    start = acceptance_start() + timedelta(days=1)
    with SessionLocal() as db:
        meeting = models.Meeting(
            title="Dữ liệu example.com cần chuyển email",
            organizer_email=LEADER,
            expected_attendees=3,
            start_time=start,
            end_time=start + timedelta(hours=1),
            participants=[
                models.Participant(email=EMPLOYEE_ONE),
                models.Participant(email=EMPLOYEE_TWO),
            ],
        )
        db.add(meeting)
        db.flush()
        db.add_all([
            models.Reminder(
                meeting_id=meeting.id,
                recipient_email=email,
                remind_at=start - timedelta(hours=1),
            )
            for email in (LEADER, EMPLOYEE_ONE, EMPLOYEE_TWO)
        ])
        db.commit()
        meeting_id = meeting.id

    monkeypatch.setattr(
        app_main,
        "get_settings",
        lambda: SimpleNamespace(
            leader_email=real_leader,
            employee_one_email=real_employee_one,
            employee_two_email=real_employee_two,
        ),
    )
    app_main.migrate_employee_emails()

    with SessionLocal() as db:
        migrated = db.get(models.Meeting, meeting_id)
        assert migrated.organizer_email == real_leader
        assert {item.email for item in migrated.participants} == {
            real_employee_one,
            real_employee_two,
        }
        assert {item.recipient_email for item in migrated.reminders} == {
            real_leader,
            real_employee_one,
            real_employee_two,
        }
