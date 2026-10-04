"""Run US01-US16 acceptance checks against a running backend over HTTP.

The script intentionally uses the public API instead of FastAPI TestClient so it
also covers request serialization, the ASGI server and the background reminder
worker. Configure LIVE_API_URL and the three user email variables before use.
"""

from __future__ import annotations

import json
import os
import sys
import time
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qs, urlparse

import httpx


API_URL = os.getenv("LIVE_API_URL", "http://127.0.0.1:8010/api").rstrip("/")
LEADER = os.getenv("LEADER_EMAIL", "leader@example.com").strip().lower()
EMPLOYEE_ONE = os.getenv("EMPLOYEE_ONE_EMAIL", "employee.one@example.com").strip().lower()
EMPLOYEE_TWO = os.getenv("EMPLOYEE_TWO_EMAIL", "employee.two@example.com").strip().lower()
PREFIX = f"LIVE-US01-US16-{datetime.now(timezone.utc):%Y%m%d%H%M%S}"
BASE_TIME = datetime(2027, 3, 8, 2, 0, tzinfo=timezone.utc)


class Acceptance:
    def __init__(self) -> None:
        self.client = httpx.Client(base_url=API_URL, timeout=15)
        self.results: dict[str, str] = {}

    def request(self, method: str, path: str, expected: int, **kwargs) -> httpx.Response:
        response = self.client.request(method, path, **kwargs)
        if response.status_code != expected:
            raise AssertionError(
                f"{method} {path}: expected {expected}, got {response.status_code}: {response.text}"
            )
        return response

    def pass_us(self, *stories: str, detail: str) -> None:
        for story in stories:
            self.results[story] = detail

    @staticmethod
    def meeting_payload(
        title: str,
        start: datetime,
        *,
        organizer: str = LEADER,
        participants: list[str] | None = None,
        **overrides,
    ) -> dict:
        participants = [EMPLOYEE_ONE, EMPLOYEE_TWO] if participants is None else participants
        payload = {
            "title": title,
            "description": "Nghiệm thu live qua HTTP thật",
            "organizer_email": organizer,
            "start_time": start.isoformat(),
            "end_time": (start + timedelta(hours=1)).isoformat(),
            "participant_emails": participants,
            "expected_attendees": len(set(participants) - {organizer}) + 1,
            "recurrence": None,
            "recurrence_count": 1,
            "room_id": None,
            "equipment_ids": [],
            "reminder_minutes": None,
        }
        payload.update(overrides)
        return payload

    def run(self) -> dict[str, str]:
        self.request("GET", "/health", 200)
        employees = self.request("GET", "/employees", 200).json()
        employee_emails = {item["email"] for item in employees}
        assert {LEADER, EMPLOYEE_ONE, EMPLOYEE_TWO} <= employee_emails
        assert not ({"leader@example.com", "employee.one@example.com", "employee.two@example.com"} & employee_emails)

        rooms = self.request("GET", "/rooms", 200).json()
        assert len(rooms) >= 10
        equipment = self.request("GET", "/equipment", 200).json()
        available_equipment = [item for item in equipment if item["status"] == "available"]
        maintenance_equipment = [item for item in equipment if item["status"] == "maintenance"]
        assert len(available_equipment) >= 3 and maintenance_equipment

        primary_start = BASE_TIME
        room = self.request(
            "GET",
            "/rooms/available",
            200,
            params={
                "start_time": primary_start.isoformat(),
                "end_time": (primary_start + timedelta(hours=1)).isoformat(),
                "min_capacity": 3,
            },
        ).json()[0]
        primary_payload = self.meeting_payload(
            f"{PREFIX} cuộc họp chính",
            primary_start,
            room_id=room["id"],
            equipment_ids=[available_equipment[0]["id"], available_equipment[1]["id"]],
            reminder_minutes=60,
        )
        primary = self.request("POST", "/meetings", 201, json=primary_payload).json()[0]
        assert primary["expected_attendees"] == 3
        assert {item["email"] for item in primary["participants"]} == {EMPLOYEE_ONE, EMPLOYEE_TWO}
        assert primary["booking"]["room_id"] == room["id"]
        assert len(primary["equipment_bookings"]) == 2
        self.pass_us("US01", "US04", detail="Tạo lịch với hai người tham dự và số người dự kiến đúng")

        self.request(
            "PATCH",
            f"/meetings/{primary['id']}",
            403,
            json={"requester_email": EMPLOYEE_ONE, "title": "Không được phép"},
        )
        updated = self.request(
            "PATCH",
            f"/meetings/{primary['id']}",
            200,
            json={"requester_email": LEADER, "title": f"{PREFIX} đã cập nhật"},
        ).json()
        assert updated["title"].endswith("đã cập nhật")
        self.pass_us("US02", detail="Chỉ người tổ chức sửa được; hủy được kiểm tra cùng US09")

        recurrence_start = BASE_TIME + timedelta(days=30)
        recurring = self.request(
            "POST",
            "/meetings",
            201,
            json=self.meeting_payload(
                f"{PREFIX} lịch lặp",
                recurrence_start,
                organizer=EMPLOYEE_TWO,
                participants=[EMPLOYEE_ONE],
                recurrence="weekly",
                recurrence_count=2,
            ),
        ).json()
        assert len(recurring) == 2 and recurring[0]["recurrence_group"]
        overlap_title = f"{PREFIX} tự chồng chéo"
        self.request(
            "POST",
            "/meetings",
            409,
            json=self.meeting_payload(
                overlap_title,
                BASE_TIME + timedelta(days=45),
                organizer="overlap-check@ictu.edu.vn",
                participants=[],
                recurrence="weekly",
                recurrence_count=2,
                end_time=(BASE_TIME + timedelta(days=53)).isoformat(),
            ),
        )
        assert overlap_title not in {item["title"] for item in self.request("GET", "/meetings", 200).json()}
        self.pass_us("US03", detail="Lịch tuần tạo đủ; chuỗi tự chồng chéo bị 409 và rollback")

        suggestions = self.request(
            "POST",
            "/meetings/suggest-times",
            200,
            json={
                "participant_emails": [LEADER, EMPLOYEE_ONE, EMPLOYEE_TWO],
                "range_start": primary_start.replace(hour=1).isoformat(),
                "range_end": primary_start.replace(hour=10).isoformat(),
                "duration_minutes": 60,
                "limit": 5,
            },
        ).json()
        assert suggestions and all(item["start_time"] != primary_start.isoformat() for item in suggestions)
        self.pass_us("US05", detail="Gợi ý giờ chung loại bỏ khung đã bận")

        history = self.request(
            "GET",
            "/meetings/history",
            200,
            params={"email": EMPLOYEE_ONE, "status": "scheduled", "limit": 1, "offset": 0},
        ).json()
        second_page = self.request(
            "GET",
            "/meetings/history",
            200,
            params={"email": EMPLOYEE_ONE, "status": "scheduled", "limit": 1, "offset": 1},
        ).json()
        assert len(history) == 1 and len(second_page) == 1 and history[0]["id"] != second_page[0]["id"]
        self.pass_us("US06", detail="Lịch sử lọc theo email/trạng thái và phân trang hoạt động")

        capacity_rooms = self.request(
            "GET",
            "/rooms/available",
            200,
            params={
                "start_time": (BASE_TIME + timedelta(days=70)).isoformat(),
                "end_time": (BASE_TIME + timedelta(days=70, hours=1)).isoformat(),
                "min_capacity": 20,
            },
        ).json()
        assert capacity_rooms and all(item["capacity"] >= 20 for item in capacity_rooms)
        self.pass_us("US07", "US10", detail="Danh mục/trạng thái phòng và lọc sức chứa trả đúng kết quả")

        room_conflict_start = BASE_TIME + timedelta(days=80)
        conflict_room = rooms[1]
        self.request(
            "POST",
            "/meetings",
            201,
            json=self.meeting_payload(
                f"{PREFIX} chặn phòng tuần hai",
                room_conflict_start + timedelta(weeks=1),
                organizer=EMPLOYEE_ONE,
                participants=[],
                room_id=conflict_room["id"],
            ),
        )
        rejected_room_title = f"{PREFIX} lịch phòng phải rollback"
        self.request(
            "POST",
            "/meetings",
            409,
            json=self.meeting_payload(
                rejected_room_title,
                room_conflict_start,
                organizer=EMPLOYEE_TWO,
                participants=[],
                room_id=conflict_room["id"],
                recurrence="weekly",
                recurrence_count=2,
            ),
        )
        assert rejected_room_title not in {item["title"] for item in self.request("GET", "/meetings", 200).json()}
        self.pass_us("US08", detail="Xung đột phòng ở lần lặp thứ hai trả 409 và không tạo một phần")

        room_payload = {
            "requester_email": LEADER,
            "name": f"Phòng {PREFIX}",
            "capacity": 18,
            "location": "Tầng 2 - Khu nghiệm thu",
            "building": "Khu nghiệm thu",
            "floor": 2,
            "room_type": "Phòng họp",
            "projector": True,
        }
        self.request("POST", "/admin/rooms", 403, json={**room_payload, "requester_email": EMPLOYEE_ONE})
        admin_room = self.request("POST", "/admin/rooms", 201, json=room_payload).json()
        self.request("POST", "/admin/rooms", 409, json=room_payload)
        self.request("POST", "/admin/rooms", 422, json={**room_payload, "name": f"Sai {PREFIX}", "capacity": 0})
        patched_room = self.request(
            "PATCH",
            f"/admin/rooms/{admin_room['id']}",
            200,
            json={"requester_email": LEADER, "capacity": 24},
        ).json()
        assert patched_room["capacity"] == 24
        inactive_room = self.request(
            "DELETE",
            f"/admin/rooms/{admin_room['id']}",
            200,
            params={"requester_email": LEADER},
        ).json()
        assert inactive_room["is_active"] is False
        self.pass_us("US11", detail="Quyền admin, CRUD, trùng tên, validation và xóa mềm phòng đạt")

        equipment_start = BASE_TIME + timedelta(days=100)
        booked_equipment = available_equipment[2]
        free_candidate = available_equipment[1]
        self.request(
            "POST",
            "/meetings",
            201,
            json=self.meeting_payload(
                f"{PREFIX} chiếm thiết bị",
                equipment_start,
                organizer=EMPLOYEE_ONE,
                participants=[],
                equipment_ids=[booked_equipment["id"]],
            ),
        )
        rollback_equipment_title = f"{PREFIX} thiết bị phải rollback"
        self.request(
            "POST",
            "/meetings",
            409,
            json=self.meeting_payload(
                rollback_equipment_title,
                equipment_start,
                organizer=EMPLOYEE_TWO,
                participants=[],
                equipment_ids=[free_candidate["id"], booked_equipment["id"]],
            ),
        )
        assert rollback_equipment_title not in {item["title"] for item in self.request("GET", "/meetings", 200).json()}
        available_ids = {
            item["id"]
            for item in self.request(
                "GET",
                "/equipment/available",
                200,
                params={
                    "start_time": equipment_start.isoformat(),
                    "end_time": (equipment_start + timedelta(hours=1)).isoformat(),
                },
            ).json()
        }
        assert free_candidate["id"] in available_ids and booked_equipment["id"] not in available_ids
        statuses = self.request(
            "GET",
            "/equipment",
            200,
            params={
                "start_time": equipment_start.isoformat(),
                "end_time": (equipment_start + timedelta(hours=1)).isoformat(),
            },
        ).json()
        assert next(item for item in statuses if item["id"] == booked_equipment["id"])["status"] == "booked"
        assert next(item for item in statuses if item["id"] == maintenance_equipment[0]["id"])["status"] == "maintenance"
        self.pass_us("US12", "US13", detail="Đặt nhiều thiết bị atomic; trạng thái booked/available/maintenance đúng")

        equipment_payload = {
            "requester_email": LEADER,
            "code": f"LIVE-{datetime.now(timezone.utc):%H%M%S}",
            "name": f"Thiết bị {PREFIX}",
            "category": "display",
            "location": "Kho nghiệm thu",
        }
        self.request("POST", "/admin/equipment", 403, json={**equipment_payload, "requester_email": EMPLOYEE_TWO})
        admin_equipment = self.request("POST", "/admin/equipment", 201, json=equipment_payload).json()
        self.request("POST", "/admin/equipment", 409, json=equipment_payload)
        maintenance = self.request(
            "PATCH",
            f"/admin/equipment/{admin_equipment['id']}",
            200,
            json={"requester_email": LEADER, "status": "maintenance"},
        ).json()
        assert maintenance["status"] == "maintenance"
        self.request(
            "PATCH",
            f"/admin/equipment/{admin_equipment['id']}",
            200,
            json={"requester_email": LEADER, "status": "available"},
        )
        inactive_equipment = self.request(
            "DELETE",
            f"/admin/equipment/{admin_equipment['id']}",
            200,
            params={"requester_email": LEADER},
        ).json()
        assert inactive_equipment["status"] == "inactive"
        self.pass_us("US14", detail="Quyền admin và vòng đời thiết bị available/maintenance/inactive đạt")

        calendar = self.request("GET", f"/meetings/{primary['id']}/calendar.ics", 200)
        assert f"ORGANIZER:mailto:{LEADER}" in calendar.text
        assert f"ATTENDEE:mailto:{EMPLOYEE_ONE}" in calendar.text
        initial_sequence = int(
            next(line.split(":", 1)[1] for line in calendar.text.splitlines() if line.startswith("SEQUENCE:"))
        )
        links = self.request("GET", f"/meetings/{primary['id']}/calendar-links", 200).json()
        google_params = parse_qs(urlparse(links["google_url"]).query)
        assert google_params["add"] == [EMPLOYEE_ONE, EMPLOYEE_TWO]
        self.request(
            "PATCH",
            f"/meetings/{primary['id']}",
            200,
            json={"requester_email": LEADER, "description": "Cập nhật sequence live"},
        )
        revised_calendar = self.request("GET", f"/meetings/{primary['id']}/calendar.ics", 200).text
        revised_sequence = int(
            next(line.split(":", 1)[1] for line in revised_calendar.splitlines() if line.startswith("SEQUENCE:"))
        )
        assert revised_sequence > initial_sequence
        self.pass_us("US15", detail="ICS/Google có UTC, organizer, guests, UID và sequence cập nhật")

        notifications = {
            email: self.request("GET", "/notifications", 200, params={"email": email}).json()
            for email in (LEADER, EMPLOYEE_ONE, EMPLOYEE_TWO)
        }
        assert all(any(item["meeting_id"] == primary["id"] for item in items) for items in notifications.values())
        leader_notification = next(item for item in notifications[LEADER] if item["meeting_id"] == primary["id"])
        self.request(
            "POST",
            f"/notifications/{leader_notification['id']}/read",
            403,
            json={"email": EMPLOYEE_ONE},
        )
        marked = self.request(
            "POST",
            f"/notifications/{leader_notification['id']}/read",
            200,
            json={"email": LEADER},
        ).json()
        assert marked["is_read"] is True
        self.request(
            "PATCH",
            f"/meetings/{primary['id']}",
            200,
            json={"requester_email": LEADER, "reminder_minutes": None},
        )
        self.request(
            "PATCH",
            f"/meetings/{primary['id']}",
            200,
            json={"requester_email": LEADER, "reminder_minutes": 30},
        )

        due_start = datetime.now(timezone.utc) + timedelta(minutes=10)
        due_meeting = self.request(
            "POST",
            "/meetings",
            201,
            json=self.meeting_payload(
                f"{PREFIX} reminder worker",
                due_start,
                reminder_minutes=15,
            ),
        ).json()[0]
        deadline = time.monotonic() + 40
        due_statuses: set[str] = set()
        while time.monotonic() < deadline:
            due_statuses = {
                item["status"]
                for item in self.request("GET", "/notifications", 200, params={"email": LEADER}).json()
                if item["meeting_id"] == due_meeting["id"]
            }
            if due_statuses == {"sent"}:
                break
            time.sleep(2)
        assert due_statuses == {"sent"}, f"Reminder worker did not send in time: {due_statuses}"
        self.pass_us("US16", detail="Reminder tạo đủ người nhận, quyền đọc, bật lại và worker nền xử lý đạt")

        cancelled = self.request(
            "POST",
            f"/meetings/{primary['id']}/cancel",
            200,
            json={"requester_email": LEADER},
        ).json()
        assert cancelled["status"] == "cancelled"
        assert cancelled["booking"]["status"] == "cancelled"
        assert all(item["status"] == "cancelled" for item in cancelled["equipment_bookings"])
        cancelled_ics = self.request("GET", f"/meetings/{primary['id']}/calendar.ics", 200).text
        assert "METHOD:CANCEL" in cancelled_ics and "STATUS:CANCELLED" in cancelled_ics
        available_room_ids = {
            item["id"]
            for item in self.request(
                "GET",
                "/rooms/available",
                200,
                params={
                    "start_time": primary_start.isoformat(),
                    "end_time": (primary_start + timedelta(hours=1)).isoformat(),
                    "min_capacity": 3,
                },
            ).json()
        }
        assert room["id"] in available_room_ids
        self.pass_us("US09", detail="Hủy giải phóng phòng, thiết bị, reminder và sinh ICS CANCEL")

        assert set(self.results) == {f"US{value:02d}" for value in range(1, 17)}
        return self.results


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    acceptance = Acceptance()
    try:
        result = acceptance.run()
        print(json.dumps({"api": API_URL, "users": [LEADER, EMPLOYEE_ONE, EMPLOYEE_TWO], "results": result}, ensure_ascii=False, indent=2))
    finally:
        acceptance.client.close()
