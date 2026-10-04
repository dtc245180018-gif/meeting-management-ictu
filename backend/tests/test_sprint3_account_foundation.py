import csv
from types import SimpleNamespace

from sqlalchemy import select

from app import main as app_main
from app import models
from app.database import SessionLocal
from app.passwords import verify_password


def test_every_employee_receives_a_hashed_idempotent_sprint3_account(
    client, monkeypatch, tmp_path
):
    credentials_path = tmp_path / "sprint3_credentials.local.csv"
    monkeypatch.setattr(
        app_main,
        "get_settings",
        lambda: SimpleNamespace(
            sprint3_seed_accounts=True,
            sprint3_credentials_file=str(credentials_path),
            admin_email_list={"leader@example.com"},
            leader_email="leader@example.com",
        ),
    )

    assert app_main.seed_user_accounts() == 10
    assert app_main.seed_user_accounts() == 0

    with credentials_path.open("r", encoding="utf-8-sig", newline="") as source:
        credentials = list(csv.DictReader(source))

    with SessionLocal() as db:
        employees = db.scalars(select(models.Employee).order_by(models.Employee.id)).all()
        accounts = db.scalars(select(models.UserAccount).order_by(models.UserAccount.id)).all()

        assert len(employees) == len(accounts) == len(credentials) == 10
        accounts_by_email = {account.email: account for account in accounts}
        credentials_by_email = {row["email"]: row for row in credentials}

        for employee in employees:
            account = accounts_by_email[employee.email]
            credential = credentials_by_email[employee.email]
            assert account.employee_id == employee.id
            assert account.must_change_password is True
            assert account.is_active is True
            assert credential["temporary_password"] not in account.password_hash
            assert verify_password(credential["temporary_password"], account.password_hash)

        assert accounts_by_email["leader@example.com"].role == models.AccountRole.ADMIN
        assert all(
            account.role == models.AccountRole.EMPLOYEE
            for email, account in accounts_by_email.items()
            if email != "leader@example.com"
        )

    shared_demo_password = "SharedDemo123!"
    assert app_main.set_shared_sprint3_demo_password(shared_demo_password) == 10

    with credentials_path.open("r", encoding="utf-8-sig", newline="") as source:
        rotated_credentials = list(csv.DictReader(source))

    with SessionLocal() as db:
        rotated_accounts = db.scalars(select(models.UserAccount)).all()
        assert len({account.password_hash for account in rotated_accounts}) == 10
        assert all(
            verify_password(shared_demo_password, account.password_hash)
            and account.must_change_password
            for account in rotated_accounts
        )
        assert {row["temporary_password"] for row in rotated_credentials} == {
            shared_demo_password
        }
