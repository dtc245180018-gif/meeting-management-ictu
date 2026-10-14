from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select

from app import models
from app.database import SessionLocal
from app.passwords import hash_password


PASSWORD = "ICTU123"


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
    response = client.post("/api/auth/login", json={"email": email, "password": PASSWORD})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def future_window(minutes: int = 10) -> tuple[datetime, datetime]:
    start = datetime.now(timezone.utc) + timedelta(minutes=minutes)
    start = start.replace(second=0, microsecond=0)
    return start, start + timedelta(hours=1)


def test_us26_recommendations_are_ranked_explainable_and_permission_aware(client):
    email = "recommend.organizer@ictu.edu.vn"
    create_account(email, models.AccountRole.ORGANIZER)
    headers = login(client, email)
    start, end = future_window(180)

    rooms = client.get("/api/rooms", headers=headers).json()
    denied_room = next(room for room in rooms if room["projector"] and room["capacity"] >= 6)
    with SessionLocal() as db:
        account = db.scalar(select(models.UserAccount).where(models.UserAccount.email == email))
        db.add(
            models.RoomAccessPolicy(
                account_id=account.id,
                room_id=denied_room["id"],
                can_book=False,
                reason="Phòng dành cho Ban giám hiệu",
            )
        )
        db.commit()

    response = client.post(
        "/api/rooms/recommendations",
        headers=headers,
        json={
            "start_time": start.isoformat(),
            "end_time": end.isoformat(),
            "expected_attendees": 6,
            "required_features": ["projector"],
            "preferred_building": "Khu B",
            "page": 1,
            "page_size": 3,
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["items"]
    assert body["total"] >= len(body["items"])
    assert denied_room["id"] not in {item["room"]["id"] for item in body["items"]}
    assert all(item["room"]["capacity"] >= 6 for item in body["items"])
    assert all(item["room"]["projector"] for item in body["items"])
    assert all(item["reasons"] for item in body["items"])
    assert [item["score"] for item in body["items"]] == sorted(
        [item["score"] for item in body["items"]], reverse=True
    )

    repeated = client.post(
        "/api/rooms/recommendations",
        headers=headers,
        json={
            "start_time": start.isoformat(),
            "end_time": end.isoformat(),
            "expected_attendees": 6,
            "required_features": ["projector"],
            "preferred_building": "Khu B",
            "page": 1,
            "page_size": 3,
        },
    ).json()
    assert [item["room"]["id"] for item in body["items"]] == [
        item["room"]["id"] for item in repeated["items"]
    ]


def test_us26_returns_clear_empty_result_and_rejects_busy_equipment(client):
    email = "recommend.empty@ictu.edu.vn"
    create_account(email, models.AccountRole.ORGANIZER)
    headers = login(client, email)
    start, end = future_window(240)
    empty = client.post(
        "/api/rooms/recommendations",
        headers=headers,
        json={
            "start_time": start.isoformat(),
            "end_time": end.isoformat(),
            "expected_attendees": 10000,
        },
    )
    assert empty.status_code == 200
    assert empty.json()["items"] == []
    assert "Không có phòng" in empty.json()["message"]

    with SessionLocal() as db:
        equipment = db.scalar(select(models.Equipment).where(models.Equipment.is_active.is_(True)))
        equipment.status = models.EquipmentStatus.MAINTENANCE
        equipment_id = equipment.id
        db.commit()
    unavailable = client.post(
        "/api/rooms/recommendations",
        headers=headers,
        json={
            "start_time": start.isoformat(),
            "end_time": end.isoformat(),
            "expected_attendees": 2,
            "equipment_ids": [equipment_id],
        },
    )
    assert unavailable.status_code == 409
    assert "không sẵn sàng" in unavailable.json()["detail"]


def test_us27_signed_qr_is_authorized_idempotent_and_audited(client):
    organizer = "qr.organizer@ictu.edu.vn"
    participant = "qr.participant@ictu.edu.vn"
    outsider = "qr.outsider@ictu.edu.vn"
    create_account(organizer, models.AccountRole.ORGANIZER)
    create_account(participant, models.AccountRole.PARTICIPANT)
    create_account(outsider, models.AccountRole.PARTICIPANT)
    organizer_headers = login(client, organizer)
    participant_headers = login(client, participant)
    outsider_headers = login(client, outsider)
    start, end = future_window(5)
    room_id = client.get("/api/rooms", headers=organizer_headers).json()[0]["id"]
    created = client.post(
        "/api/meetings",
        headers=organizer_headers,
        json={
            "title": "Check-in QR Sprint 4",
            "organizer_email": organizer,
            "start_time": start.isoformat(),
            "end_time": end.isoformat(),
            "participant_emails": [participant],
            "expected_attendees": 2,
            "room_id": room_id,
        },
    )
    assert created.status_code == 201, created.text
    meeting = created.json()[0]
    booking_id = meeting["booking"]["id"]

    denied_generation = client.get(f"/api/bookings/{booking_id}/qr", headers=participant_headers)
    assert denied_generation.status_code == 403
    qr = client.get(f"/api/bookings/{booking_id}/qr", headers=organizer_headers)
    assert qr.status_code == 200, qr.text
    token = qr.json()["qr_token"]
    assert qr.json()["image_data_url"].startswith("data:image/svg+xml;base64,")

    outsider_result = client.post(
        "/api/bookings/qr/inspect",
        headers=outsider_headers,
        json={"qr_token": token},
    )
    assert outsider_result.status_code == 403

    inspected = client.post(
        "/api/bookings/qr/inspect",
        headers=participant_headers,
        json={"qr_token": token},
    )
    assert inspected.status_code == 200, inspected.text
    assert inspected.json()["can_check_in"] is True

    first = client.post(
        "/api/bookings/qr/check-in",
        headers=participant_headers,
        json={"qr_token": token},
    )
    second = client.post(
        "/api/bookings/qr/check-in",
        headers=participant_headers,
        json={"qr_token": token},
    )
    assert first.status_code == second.status_code == 200
    assert first.json()["already_recorded"] is False
    assert second.json()["already_recorded"] is True

    checked_out = client.post(
        "/api/bookings/qr/check-out",
        headers=participant_headers,
        json={"qr_token": token},
    )
    repeated_checkout = client.post(
        "/api/bookings/qr/check-out",
        headers=participant_headers,
        json={"qr_token": token},
    )
    assert checked_out.status_code == repeated_checkout.status_code == 200
    assert repeated_checkout.json()["already_recorded"] is True

    tampered = client.post(
        "/api/bookings/qr/inspect",
        headers=participant_headers,
        json={"qr_token": token[:-1] + ("a" if token[-1] != "a" else "b")},
    )
    assert tampered.status_code == 422
    with SessionLocal() as db:
        assert db.scalar(select(func.count(models.BookingAttendance.id))) == 1
        assert db.scalar(select(func.count(models.BookingUsageAudit.id))) >= 7


def test_us27_checkout_before_checkin_and_cancelled_meeting_are_rejected(client):
    organizer = "qr.cancel.organizer@ictu.edu.vn"
    participant = "qr.cancel.member@ictu.edu.vn"
    create_account(organizer, models.AccountRole.ORGANIZER)
    create_account(participant, models.AccountRole.PARTICIPANT)
    organizer_headers = login(client, organizer)
    participant_headers = login(client, participant)
    start, end = future_window(5)
    room_id = client.get("/api/rooms", headers=organizer_headers).json()[0]["id"]
    meeting = client.post(
        "/api/meetings",
        headers=organizer_headers,
        json={
            "title": "QR bị hủy",
            "organizer_email": organizer,
            "start_time": start.isoformat(),
            "end_time": end.isoformat(),
            "participant_emails": [participant],
            "expected_attendees": 2,
            "room_id": room_id,
        },
    ).json()[0]
    token = client.get(
        f"/api/bookings/{meeting['booking']['id']}/qr", headers=organizer_headers
    ).json()["qr_token"]
    before = client.post(
        "/api/bookings/qr/check-out",
        headers=participant_headers,
        json={"qr_token": token},
    )
    assert before.status_code == 409
    cancelled = client.post(
        f"/api/meetings/{meeting['id']}/cancel",
        headers=organizer_headers,
        json={"requester_email": organizer, "reason": "Đổi kế hoạch"},
    )
    assert cancelled.status_code == 200
    after = client.post(
        "/api/bookings/qr/check-in",
        headers=participant_headers,
        json={"qr_token": token},
    )
    assert after.status_code == 409


def test_us28_hrm_sync_is_admin_only_partial_and_idempotent(client):
    admin = "hrm.admin@ictu.edu.vn"
    participant = "hrm.viewer@ictu.edu.vn"
    create_account(admin, models.AccountRole.ADMIN)
    create_account(participant, models.AccountRole.PARTICIPANT)
    admin_headers = login(client, admin)
    participant_headers = login(client, participant)
    records = [
        {
            "external_id": "ERP-1001",
            "full_name": "Nhân viên ERP",
            "email": "erp.user@ictu.edu.vn",
            "department": "Phòng ERP",
            "is_active": True,
            "role": "organizer",
        },
        {"external_id": "ERP-BROKEN", "email": "not-an-email"},
    ]

    denied = client.post(
        "/api/admin/integrations/hrm/sync",
        headers=participant_headers,
        json={"records": records},
    )
    assert denied.status_code == 403

    first = client.post(
        "/api/admin/integrations/hrm/sync",
        headers=admin_headers,
        json={"records": records},
    )
    assert first.status_code == 200, first.text
    assert first.json()["created_count"] == 1
    assert first.json()["failed_count"] == 1
    assert first.json()["status"] == "completed_with_errors"
    assert first.json()["issues"][0]["record_key"] == "ERP-BROKEN"

    second = client.post(
        "/api/admin/integrations/hrm/sync",
        headers=admin_headers,
        json={"records": records[:1]},
    )
    assert second.status_code == 200, second.text
    assert second.json()["created_count"] == 0
    assert second.json()["skipped_count"] == 1

    changed = {**records[0], "department": "Phòng Đào tạo", "is_active": False}
    third = client.post(
        "/api/admin/integrations/hrm/sync",
        headers=admin_headers,
        json={"records": [changed]},
    )
    assert third.status_code == 200
    assert third.json()["updated_count"] == 1
    with SessionLocal() as db:
        employees = db.scalars(
            select(models.Employee).where(models.Employee.external_employee_id == "ERP-1001")
        ).all()
        assert len(employees) == 1
        assert employees[0].department == "Phòng Đào tạo"
        assert employees[0].is_active is False
        assert employees[0].account.is_active is False

    history = client.get(
        "/api/admin/integrations/hrm/history?page=1&page_size=2",
        headers=admin_headers,
    )
    assert history.status_code == 200
    assert history.json()["total"] == 3
    assert len(history.json()["items"]) == 2
    status_response = client.get("/api/admin/integrations/hrm/status", headers=admin_headers)
    assert status_response.status_code == 200
    assert status_response.json()["connector"] == "mock"
