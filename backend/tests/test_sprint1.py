from datetime import datetime, timedelta, timezone
from concurrent.futures import ThreadPoolExecutor

from fastapi.testclient import TestClient

from app.main import app


ORGANIZER = "leader@example.com"


def future_time(days=1, hour=9):
    now = datetime.now(timezone.utc) + timedelta(days=days)
    return now.replace(hour=hour, minute=0, second=0, microsecond=0)


def meeting_payload(**overrides):
    start = overrides.pop("start_time", future_time())
    payload = {
        "title": "Họp Sprint 1",
        "description": "Trao đổi tiến độ nhóm",
        "organizer_email": ORGANIZER,
        "start_time": start.isoformat(),
        "end_time": (start + timedelta(hours=1)).isoformat(),
        "participant_emails": ["member1@ictu.edu.vn", "member2@ictu.edu.vn"],
        "recurrence": None,
        "recurrence_count": 1,
    }
    payload.update(overrides)
    return payload


def test_create_update_cancel_and_history(client):
    created = client.post("/api/meetings", json=meeting_payload())
    assert created.status_code == 201
    meeting = created.json()[0]
    assert meeting["title"] == "Họp Sprint 1"
    assert len(meeting["participants"]) == 2

    updated = client.patch(
        f"/api/meetings/{meeting['id']}",
        json={"requester_email": ORGANIZER, "title": "Họp Sprint 1 - cập nhật"},
    )
    assert updated.status_code == 200
    assert updated.json()["title"].endswith("cập nhật")

    denied = client.patch(
        f"/api/meetings/{meeting['id']}",
        json={"requester_email": "other@ictu.edu.vn", "title": "Không hợp lệ"},
    )
    assert denied.status_code == 403

    history = client.get("/api/meetings/history", params={"email": "member1@ictu.edu.vn"})
    assert history.status_code == 200
    assert len(history.json()) == 1

    forbidden_history = client.get("/api/meetings/history", params={"email": "outsider@ictu.edu.vn"})
    assert forbidden_history.status_code == 200
    assert forbidden_history.json() == []

    filtered_history = client.get(
        "/api/meetings/history",
        params={"email": "member1@ictu.edu.vn", "status": "scheduled", "limit": 1},
    )
    assert filtered_history.status_code == 200
    assert len(filtered_history.json()) == 1

    cancelled = client.post(
        f"/api/meetings/{meeting['id']}/cancel",
        json={"requester_email": ORGANIZER},
    )
    assert cancelled.status_code == 200
    assert cancelled.json()["status"] == "cancelled"


def test_update_participants_replaces_invites_without_http_500(client):
    created = client.post("/api/meetings", json=meeting_payload()).json()[0]
    original_member = created["participants"][0]

    updated = client.patch(
        f"/api/meetings/{created['id']}",
        json={
            "requester_email": ORGANIZER,
            "participant_emails": ["member1@ictu.edu.vn", "new-member@ictu.edu.vn"],
        },
    )

    assert updated.status_code == 200
    participants = updated.json()["participants"]
    assert {participant["email"] for participant in participants} == {
        "member1@ictu.edu.vn",
        "new-member@ictu.edu.vn",
    }
    assert next(participant["id"] for participant in participants if participant["email"] == original_member["email"]) == original_member["id"]


def test_monthly_recurrence_keeps_end_of_month_anchor(client):
    start = datetime(2027, 1, 31, 9, tzinfo=timezone.utc)
    response = client.post(
        "/api/meetings",
        json=meeting_payload(
            start_time=start,
            recurrence="monthly",
            recurrence_count=4,
            participant_emails=[],
        ),
    )

    assert response.status_code == 201
    dates = [datetime.fromisoformat(item["start_time"]).date().isoformat() for item in response.json()]
    assert dates == ["2027-01-31", "2027-02-28", "2027-03-31", "2027-04-30"]


def test_recurring_meeting_and_person_conflict(client):
    start = future_time(days=2)
    recurring = client.post(
        "/api/meetings",
        json=meeting_payload(start_time=start, recurrence="weekly", recurrence_count=3),
    )
    assert recurring.status_code == 201
    assert len(recurring.json()) == 3
    assert recurring.json()[0]["recurrence_group"]

    conflict = client.post(
        "/api/meetings",
        json=meeting_payload(
            title="Lịch bị trùng",
            start_time=(start + timedelta(minutes=30)),
            end_time=(start + timedelta(hours=2)).isoformat(),
        ),
    )
    assert conflict.status_code == 409


def test_suggest_common_free_time(client):
    start = future_time(days=3)
    while start.weekday() >= 5:
        start += timedelta(days=1)
    client.post("/api/meetings", json=meeting_payload(start_time=start))

    response = client.post(
        "/api/meetings/suggest-times",
        json={
            "participant_emails": [ORGANIZER, "member1@ictu.edu.vn"],
            "range_start": start.replace(hour=8).isoformat(),
            "range_end": start.replace(hour=17).isoformat(),
            "duration_minutes": 60,
            "limit": 3,
        },
    )
    assert response.status_code == 200
    suggestions = response.json()
    assert len(suggestions) == 3
    assert all(item["start_time"] != start.isoformat() for item in suggestions)


def test_available_rooms_booking_and_double_booking(client):
    start = future_time(days=4)
    first = client.post("/api/meetings", json=meeting_payload(start_time=start)).json()[0]

    rooms = client.get(
        "/api/rooms/available",
        params={
            "start_time": start.isoformat(),
            "end_time": (start + timedelta(hours=1)).isoformat(),
            "min_capacity": 3,
        },
    )
    assert rooms.status_code == 200
    room_id = rooms.json()[0]["id"]

    booked = client.post(
        "/api/rooms/bookings",
        json={"room_id": room_id, "meeting_id": first["id"], "requester_email": ORGANIZER},
    )
    assert booked.status_code == 201

    second_payload = meeting_payload(
        title="Cuộc họp khác",
        organizer_email="another@ictu.edu.vn",
        participant_emails=["new@ictu.edu.vn"],
        start_time=start,
    )
    second = client.post("/api/meetings", json=second_payload).json()[0]
    duplicate = client.post(
        "/api/rooms/bookings",
        json={"room_id": room_id, "meeting_id": second["id"], "requester_email": "another@ictu.edu.vn"},
    )
    assert duplicate.status_code == 409


def test_concurrent_booking_allows_only_one_booking(client):
    start = future_time(days=5)
    first = client.post("/api/meetings", json=meeting_payload(start_time=start)).json()[0]
    room_id = client.get(
        "/api/rooms/available",
        params={
            "start_time": start.isoformat(),
            "end_time": (start + timedelta(hours=1)).isoformat(),
            "min_capacity": 3,
        },
    ).json()[0]["id"]
    second = client.post(
        "/api/meetings",
        json=meeting_payload(
            title="Cuộc họp đồng thời",
            organizer_email="another@ictu.edu.vn",
            participant_emails=[],
            start_time=start + timedelta(hours=2),
        ),
    ).json()[0]

    def book(meeting_id: int, requester: str) -> int:
        with TestClient(app) as concurrent_client:
            return concurrent_client.post(
                "/api/rooms/bookings",
                json={"room_id": room_id, "meeting_id": meeting_id, "requester_email": requester},
            ).status_code

    # Make the second meeting overlap the first after it has been created. The
    # room lock, followed by the availability check, is the critical section.
    from app.database import SessionLocal
    from app import models

    with SessionLocal() as db:
        db.get(models.Meeting, second["id"]).start_time = start
        db.get(models.Meeting, second["id"]).end_time = start + timedelta(hours=1)
        db.commit()

    with ThreadPoolExecutor(max_workers=2) as pool:
        statuses = sorted(pool.map(
            lambda args: book(*args),
            [(first["id"], ORGANIZER), (second["id"], "another@ictu.edu.vn")],
        ))

    assert statuses == [201, 409]


def test_room_directory_and_employee_fixture(client):
    rooms = client.get("/api/rooms")
    assert rooms.status_code == 200
    assert {room["name"] for room in rooms.json()} >= {"Phòng A101", "Phòng A203"}

    employees = client.get("/api/employees")
    assert employees.status_code == 200
    assert len(employees.json()) == 10
    assert {employee["email"] for employee in employees.json()} >= {
        ORGANIZER,
        "trangnt@ictu.edu.vn",
        "longbd@ictu.edu.vn",
        "phuonghl@ictu.edu.vn",
        "viettq@ictu.edu.vn",
    }


def test_expected_attendees_is_persisted_and_controls_booking_capacity(client):
    start = future_time(days=6)
    created = client.post(
        "/api/meetings",
        json=meeting_payload(start_time=start, participant_emails=[], expected_attendees=20),
    )
    assert created.status_code == 201
    meeting = created.json()[0]
    assert meeting["expected_attendees"] == 20

    room = next(room for room in client.get("/api/rooms").json() if room["capacity"] == 6)
    booking = client.post(
        "/api/rooms/bookings",
        json={"room_id": room["id"], "meeting_id": meeting["id"], "requester_email": ORGANIZER},
    )
    assert booking.status_code == 409

    small = client.post(
        "/api/meetings",
        json=meeting_payload(title="Cuộc họp nhỏ", start_time=start + timedelta(hours=2), participant_emails=[], expected_attendees=2),
    ).json()[0]
    assert client.post(
        "/api/rooms/bookings",
        json={"room_id": room["id"], "meeting_id": small["id"], "requester_email": ORGANIZER},
    ).status_code == 201
    resized = client.patch(
        f"/api/meetings/{small['id']}",
        json={"requester_email": ORGANIZER, "expected_attendees": 9},
    )
    assert resized.status_code == 409


def test_recurring_meeting_with_room_is_atomic_when_later_occurrence_conflicts(client):
    first_week = future_time(days=7)
    room = next(room for room in client.get("/api/rooms").json() if room["capacity"] == 6)
    blocker = client.post(
        "/api/meetings",
        json=meeting_payload(
            title="Lịch chiếm tuần hai",
            organizer_email="blocker@ictu.edu.vn",
            participant_emails=[],
            start_time=first_week + timedelta(weeks=1),
            expected_attendees=1,
        ),
    ).json()[0]
    assert client.post(
        "/api/rooms/bookings",
        json={"room_id": room["id"], "meeting_id": blocker["id"], "requester_email": "blocker@ictu.edu.vn"},
    ).status_code == 201

    recurring = client.post(
        "/api/meetings",
        json=meeting_payload(
            title="Lịch lặp atomic",
            participant_emails=[],
            start_time=first_week,
            recurrence="weekly",
            recurrence_count=2,
            expected_attendees=1,
            room_id=room["id"],
        ),
    )
    assert recurring.status_code == 409
    assert [meeting["title"] for meeting in client.get("/api/meetings").json()] == ["Lịch chiếm tuần hai"]

    successful = client.post(
        "/api/meetings",
        json=meeting_payload(
            title="Lịch lặp atomic thành công",
            participant_emails=[],
            start_time=first_week + timedelta(weeks=3),
            recurrence="weekly",
            recurrence_count=2,
            expected_attendees=1,
            room_id=room["id"],
        ),
    )
    assert successful.status_code == 201
    assert all(item["booking"]["room_id"] == room["id"] for item in successful.json())


def test_overlapping_recurrences_are_rejected_without_a_room(client):
    start = future_time(days=8)
    response = client.post(
        "/api/meetings",
        json=meeting_payload(
            title="Lịch lặp chồng chéo",
            participant_emails=[],
            start_time=start,
            end_time=(start + timedelta(days=8)).isoformat(),
            recurrence="weekly",
            recurrence_count=2,
            expected_attendees=1,
            room_id=None,
        ),
    )

    assert response.status_code == 409
    assert response.json()["detail"] == "Các lần lặp của cuộc họp bị chồng chéo thời gian"
    assert client.get("/api/meetings").json() == []


def test_titles_are_trimmed_and_unknown_request_fields_are_rejected(client):
    invalid_title = client.post("/api/meetings", json=meeting_payload(title="   "))
    assert invalid_title.status_code == 422

    created = client.post("/api/meetings", json=meeting_payload(title="Họp hợp lệ")).json()[0]
    invalid_update = client.patch(
        f"/api/meetings/{created['id']}",
        json={"requester_email": ORGANIZER, "title": "   "},
    )
    assert invalid_update.status_code == 422

    unknown_field = client.post("/api/meetings", json=meeting_payload(unexpected_field=True))
    assert unknown_field.status_code == 422
