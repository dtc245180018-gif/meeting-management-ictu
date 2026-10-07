from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app import models
from app.database import SessionLocal
from app.passwords import hash_password


PASSWORD = "ICTU123"


def create_account(
    email: str,
    role: models.AccountRole,
    name: str,
    *,
    must_change_password: bool = False,
) -> int:
    with SessionLocal() as db:
        employee = models.Employee(
            full_name=name,
            email=email,
            department="Nhóm kiểm thử Sprint 3",
            is_active=True,
        )
        account = models.UserAccount(
            employee=employee,
            email=email,
            password_hash=hash_password(PASSWORD),
            role=role,
            must_change_password=must_change_password,
            is_active=True,
        )
        db.add(account)
        db.commit()
        return account.id


def login(client, email: str, password: str = PASSWORD) -> tuple[dict, dict]:
    response = client.post("/api/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    body = response.json()
    return {"Authorization": f"Bearer {body['access_token']}"}, body["user"]


def meeting_payload(organizer: str, room_id: int | None = None) -> dict:
    start = datetime.now(timezone.utc) + timedelta(days=3)
    return {
        "title": "Kiểm thử Sprint 3",
        "description": "Kiểm tra RBAC và báo cáo",
        "organizer_email": organizer,
        "start_time": start.isoformat(),
        "end_time": (start + timedelta(hours=1)).isoformat(),
        "participant_emails": [],
        "expected_attendees": 2,
        "room_id": room_id,
        "recurrence": None,
        "recurrence_count": 1,
    }


def test_login_me_change_password_and_revoke_old_token(client):
    create_account(
        "organizer@ictu.edu.vn",
        models.AccountRole.ORGANIZER,
        "Người tổ chức",
        must_change_password=True,
    )

    assert client.post(
        "/api/auth/login", json={"email": "organizer@ictu.edu.vn", "password": "wrong"}
    ).status_code == 401
    headers, user = login(client, "organizer@ictu.edu.vn")
    assert user["must_change_password"] is True
    assert user["role"] == "organizer"
    assert client.get("/api/auth/me", headers=headers).status_code == 200

    changed = client.post(
        "/api/auth/change-password",
        headers=headers,
        json={"current_password": PASSWORD, "new_password": "NewPassword123!"},
    )
    assert changed.status_code == 200
    assert client.get("/api/auth/me", headers=headers).status_code == 401
    _, changed_user = login(client, "organizer@ictu.edu.vn", "NewPassword123!")
    assert changed_user["must_change_password"] is False


def test_rbac_uses_authenticated_identity_and_blocks_participant_creation(client):
    create_account("organizer@ictu.edu.vn", models.AccountRole.ORGANIZER, "Người tổ chức")
    create_account("participant@ictu.edu.vn", models.AccountRole.PARTICIPANT, "Người tham dự")
    organizer_headers, _ = login(client, "organizer@ictu.edu.vn")
    participant_headers, _ = login(client, "participant@ictu.edu.vn")

    denied = client.post(
        "/api/meetings",
        headers=participant_headers,
        json=meeting_payload("spoofed@ictu.edu.vn"),
    )
    assert denied.status_code == 403

    created = client.post(
        "/api/meetings",
        headers=organizer_headers,
        json=meeting_payload("spoofed@ictu.edu.vn"),
    )
    assert created.status_code == 201, created.text
    assert created.json()[0]["organizer_email"] == "organizer@ictu.edu.vn"
    assert client.get("/api/meetings", headers=participant_headers).json() == []


def test_admin_user_management_and_last_admin_guard(client):
    admin_id = create_account("admin@ictu.edu.vn", models.AccountRole.ADMIN, "Quản trị viên")
    headers, _ = login(client, "admin@ictu.edu.vn")

    created = client.post(
        "/api/admin/users",
        headers=headers,
        json={
            "full_name": "Nhân viên mới",
            "email": "new.user@ictu.edu.vn",
            "department": "Khoa CNTT",
            "role": "participant",
        },
    )
    assert created.status_code == 201, created.text
    account_id = created.json()["id"]
    assert client.post(
        "/api/admin/users",
        headers=headers,
        json={
            "full_name": "Trùng email",
            "email": "new.user@ictu.edu.vn",
            "department": "Khoa CNTT",
            "role": "participant",
        },
    ).status_code == 409

    page = client.get("/api/admin/users?search=Nhân viên mới&page=1&page_size=5", headers=headers)
    assert page.status_code == 200
    assert page.json()["total"] == 1

    locked = client.patch(
        f"/api/admin/users/{account_id}", headers=headers, json={"is_active": False}
    )
    assert locked.status_code == 200
    assert locked.json()["is_active"] is False
    assert client.patch(
        f"/api/admin/users/{admin_id}", headers=headers, json={"role": "participant"}
    ).status_code == 409


def test_room_permission_cannot_be_bypassed_by_search_or_create(client):
    admin_id = create_account("admin@ictu.edu.vn", models.AccountRole.ADMIN, "Quản trị viên")
    organizer_id = create_account("organizer@ictu.edu.vn", models.AccountRole.ORGANIZER, "Người tổ chức")
    admin_headers, _ = login(client, "admin@ictu.edu.vn")
    organizer_headers, _ = login(client, "organizer@ictu.edu.vn")

    rooms = client.get("/api/rooms", headers=organizer_headers).json()
    room_id = rooms[0]["id"]
    denied = client.put(
        f"/api/admin/users/{organizer_id}/room-permissions/{room_id}",
        headers=admin_headers,
        json={"can_book": False, "reason": "Chỉ dành cho Ban giám hiệu"},
    )
    assert denied.status_code == 200

    directory = client.get("/api/rooms", headers=organizer_headers).json()
    restricted = next(item for item in directory if item["id"] == room_id)
    assert restricted["can_book"] is False
    assert "Ban giám hiệu" in restricted["restriction_reason"]

    payload = meeting_payload("organizer@ictu.edu.vn", room_id)
    start, end = payload["start_time"], payload["end_time"]
    available = client.get(
        "/api/rooms/available",
        params={"start_time": start, "end_time": end, "min_capacity": 1},
        headers=organizer_headers,
    )
    assert available.status_code == 200, available.text
    assert room_id not in {room["id"] for room in available.json()}
    create = client.post("/api/meetings", headers=organizer_headers, json=payload)
    assert create.status_code == 403

    assert client.put(
        f"/api/admin/users/{organizer_id}/room-permissions/{room_id}",
        headers=admin_headers,
        json={"can_book": True},
    ).status_code == 200
    meeting = client.post("/api/meetings", headers=organizer_headers, json=payload).json()[0]
    assert client.put(
        f"/api/admin/users/{organizer_id}/room-permissions/{room_id}",
        headers=admin_headers,
        json={"can_book": False, "reason": "Tạm khóa"},
    ).status_code == 200
    moved_start = datetime.fromisoformat(meeting["start_time"]) + timedelta(hours=2)
    moved_end = datetime.fromisoformat(meeting["end_time"]) + timedelta(hours=2)
    reschedule = client.patch(
        f"/api/meetings/{meeting['id']}",
        headers=organizer_headers,
        json={
            "requester_email": "spoofed@ictu.edu.vn",
            "start_time": moved_start.isoformat(),
            "end_time": moved_end.isoformat(),
        },
    )
    assert reschedule.status_code == 403


def test_admin_reports_cancellation_and_exports(client):
    create_account("admin@ictu.edu.vn", models.AccountRole.ADMIN, "Quản trị viên")
    create_account("organizer@ictu.edu.vn", models.AccountRole.ORGANIZER, "Người tổ chức")
    create_account("participant@ictu.edu.vn", models.AccountRole.PARTICIPANT, "Người tham dự")
    admin_headers, _ = login(client, "admin@ictu.edu.vn")
    organizer_headers, _ = login(client, "organizer@ictu.edu.vn")
    participant_headers, _ = login(client, "participant@ictu.edu.vn")
    room_id = client.get("/api/rooms", headers=organizer_headers).json()[0]["id"]
    created = client.post(
        "/api/meetings", headers=organizer_headers, json=meeting_payload("x@ictu.edu.vn", room_id)
    )
    meeting_id = created.json()[0]["id"]
    cancelled = client.post(
        f"/api/meetings/{meeting_id}/cancel",
        headers=organizer_headers,
        json={"requester_email": "x@ictu.edu.vn", "reason": "Trùng lịch công tác"},
    )
    assert cancelled.status_code == 200
    assert cancelled.json()["cancellation_reason"] == "Trùng lịch công tác"

    assert client.get("/api/admin/reports/overview", headers=participant_headers).status_code == 403
    report = client.get("/api/admin/reports/overview", headers=admin_headers)
    assert report.status_code == 200, report.text
    assert report.json()["summary"]["cancelled_meetings"] == 1
    assert report.json()["cancellation_reasons"][0]["reason"] == "Trùng lịch công tác"

    excel = client.get("/api/admin/reports/export?format=xlsx", headers=admin_headers)
    pdf = client.get("/api/admin/reports/export?format=pdf", headers=admin_headers)
    assert excel.status_code == 200
    assert excel.content.startswith(b"PK")
    assert pdf.status_code == 200
    assert pdf.content.startswith(b"%PDF")
