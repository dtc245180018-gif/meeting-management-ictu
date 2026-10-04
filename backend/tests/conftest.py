import os

os.environ["DATABASE_URL"] = "sqlite:///./test_meeting_management.db"
os.environ["ADMIN_EMAILS"] = "leader@example.com"
os.environ["LEADER_EMAIL"] = "leader@example.com"
os.environ["EMPLOYEE_ONE_EMAIL"] = "employee.one@example.com"
os.environ["EMPLOYEE_TWO_EMAIL"] = "employee.two@example.com"
os.environ["EMAIL_BACKEND"] = "console"
os.environ["SPRINT3_SEED_ACCOUNTS"] = "false"

import pytest
from fastapi.testclient import TestClient

from app.database import Base, engine
from app.main import app


@pytest.fixture()
def client():
    Base.metadata.drop_all(bind=engine)
    with TestClient(app) as test_client:
        yield test_client
    Base.metadata.drop_all(bind=engine)
