from datetime import datetime, timedelta, timezone


ORGANIZER = "leader@ictu.edu.vn"


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

    cancelled = client.post(
        f"/api/meetings/{meeting['id']}/cancel",
        json={"requester_email": ORGANIZER},
    )
    assert cancelled.status_code == 200
    assert cancelled.json()["status"] == "cancelled"


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
