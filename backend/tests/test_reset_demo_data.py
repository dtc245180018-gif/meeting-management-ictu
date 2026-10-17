from types import SimpleNamespace
from unittest.mock import Mock

from sqlalchemy import func, select

from app import models
from app.database import SessionLocal
from app.passwords import hash_password
from scripts import reset_demo_data


def test_full_reset_clears_account_state_and_rotates_seeded_accounts(client, monkeypatch):
    with SessionLocal() as db:
        employee = models.Employee(
            full_name="Tài khoản cũ",
            email="old@example.com",
            department="Phòng cũ",
        )
        account = models.UserAccount(
            employee=employee,
            email=employee.email,
            password_hash=hash_password("old-password"),
            role=models.AccountRole.PARTICIPANT,
        )
        room = models.Room(
            name="Phòng cũ",
            capacity=4,
            location="Khu cũ",
            building="Khu cũ",
            floor=1,
        )
        db.add_all([account, room])
        db.flush()
        db.add(models.RoomAccessPolicy(account=account, room=room, can_book=False))
        db.add(models.AccountAuditLog(actor_account_id=account.id, action="test"))
        db.add(models.GoogleCalendarConnection(
            user_email=account.email,
            google_email=account.email,
            encrypted_refresh_token="encrypted",
            scopes="calendar.events",
        ))
        db.commit()

    seed_rooms = Mock(wraps=reset_demo_data.seed_rooms)
    seed_employees = Mock(wraps=reset_demo_data.seed_employees)
    seed_equipment = Mock(wraps=reset_demo_data.seed_equipment)
    monkeypatch.setattr(reset_demo_data, "seed_rooms", seed_rooms)
    monkeypatch.setattr(reset_demo_data, "seed_employees", seed_employees)
    monkeypatch.setattr(reset_demo_data, "seed_equipment", seed_equipment)
    monkeypatch.setattr(reset_demo_data, "seed_user_accounts", lambda: 10)
    rotated_passwords: list[str] = []
    monkeypatch.setattr(
        reset_demo_data,
        "set_shared_sprint3_demo_password",
        lambda password: rotated_passwords.append(password) or 10,
    )
    monkeypatch.setattr(
        reset_demo_data,
        "get_settings",
        lambda: SimpleNamespace(initial_account_password="ICTU123"),
    )

    assert reset_demo_data.reset_demo_database(full=True) == 10
    assert rotated_passwords == ["ICTU123"]
    assert seed_rooms.call_count == 1
    assert seed_employees.call_count == 1
    assert seed_equipment.call_count == 1

    with SessionLocal() as db:
        assert db.scalar(select(func.count()).select_from(models.UserAccount)) == 0
        assert db.scalar(select(func.count()).select_from(models.RoomAccessPolicy)) == 0
        assert db.scalar(select(func.count()).select_from(models.AccountAuditLog)) == 0
        assert db.scalar(select(func.count()).select_from(models.GoogleCalendarConnection)) == 0
