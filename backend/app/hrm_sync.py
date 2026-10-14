"""Idempotent HRM/ERP adapter and audit service for Sprint 4 US28."""

from __future__ import annotations

import json
import math
from datetime import datetime, timezone
from pathlib import Path

from fastapi import HTTPException, status
from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, selectinload

from . import models, schemas
from .config import get_settings
from .passwords import hash_password


def _mock_path() -> Path:
    configured = Path(get_settings().hrm_mock_data_file).expanduser()
    if configured.is_absolute():
        return configured
    return Path(__file__).resolve().parent.parent / configured


def integration_status(db: Session) -> schemas.HRMIntegrationStatusOut:
    settings = get_settings()
    running = bool(
        db.scalar(select(models.HRMSyncRun.id).where(models.HRMSyncRun.status == "running").limit(1))
    )
    configured = settings.hrm_connector == "mock" and _mock_path().is_file()
    detail = (
        "Mock connector sẵn sàng. Có thể thay bằng adapter HRM/ERP thật qua cấu hình môi trường."
        if configured
        else "Chưa tìm thấy cấu hình hoặc dữ liệu connector HRM/ERP."
    )
    return schemas.HRMIntegrationStatusOut(
        connector=settings.hrm_connector,
        configured=configured,
        running=running,
        periodic_enabled=settings.hrm_sync_interval_minutes > 0,
        detail=detail,
    )


def _source_records(payload: schemas.HRMSyncRequest) -> tuple[str, list[dict[str, object]]]:
    if payload.records is not None:
        return "manual", payload.records
    settings = get_settings()
    if settings.hrm_connector != "mock":
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Connector HRM/ERP chưa được cấu hình",
        )
    path = _mock_path()
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Không thể đọc dữ liệu mock HRM/ERP",
        ) from exc
    if not isinstance(raw, list):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Dữ liệu connector HRM/ERP không đúng định dạng",
        )
    return "mock", [item if isinstance(item, dict) else {"invalid_record": item} for item in raw]


def _default_role() -> models.AccountRole:
    value = get_settings().hrm_default_role.strip().lower()
    try:
        role = models.AccountRole(value)
    except ValueError:
        role = models.AccountRole.PARTICIPANT
    return models.AccountRole.PARTICIPANT if role == models.AccountRole.ADMIN else role


def _safe_issue_message(error: Exception) -> str:
    if isinstance(error, ValidationError):
        messages = [item.get("msg", "Dữ liệu không hợp lệ") for item in error.errors()]
        return "; ".join(messages)[:500]
    if isinstance(error, ValueError):
        return str(error)[:500]
    return "Không thể đồng bộ bản ghi do lỗi dữ liệu"


def _upsert_record(db: Session, record: schemas.HRMEmployeeRecord) -> str:
    external_id = record.external_id.strip()
    email = str(record.email).strip().lower()
    by_external = db.scalar(
        select(models.Employee).where(models.Employee.external_employee_id == external_id)
    )
    by_email = db.scalar(
        select(models.Employee).where(func.lower(models.Employee.email) == email)
    )
    if by_external and by_email and by_external.id != by_email.id:
        raise ValueError("Mã nhân viên và email đang thuộc hai hồ sơ khác nhau")
    employee = by_external or by_email
    if employee is None:
        employee = models.Employee(
            external_employee_id=external_id,
            full_name=record.full_name.strip(),
            email=email,
            department=record.department.strip(),
            is_active=record.is_active,
        )
        db.add(employee)
        db.flush()
        role = record.role or _default_role()
        if role == models.AccountRole.ADMIN:
            role = _default_role()
        db.add(
            models.UserAccount(
                employee=employee,
                email=email,
                password_hash=hash_password(get_settings().initial_account_password),
                role=role,
                must_change_password=True,
                is_active=record.is_active,
            )
        )
        db.flush()
        return "created"

    if employee.external_employee_id and employee.external_employee_id != external_id:
        raise ValueError("Email đã được liên kết với mã nhân viên khác")
    changed = False
    values = {
        "external_employee_id": external_id,
        "full_name": record.full_name.strip(),
        "email": email,
        "department": record.department.strip(),
        "is_active": record.is_active,
    }
    for field, value in values.items():
        if getattr(employee, field) != value:
            setattr(employee, field, value)
            changed = True

    account = employee.account
    if account is None:
        role = record.role or _default_role()
        if role == models.AccountRole.ADMIN:
            role = _default_role()
        account = models.UserAccount(
            employee=employee,
            email=email,
            password_hash=hash_password(get_settings().initial_account_password),
            role=role,
            must_change_password=True,
            is_active=record.is_active,
        )
        db.add(account)
        changed = True
    else:
        if account.email != email:
            account.email = email
            account.token_version += 1
            changed = True
        if account.is_active != record.is_active:
            account.is_active = record.is_active
            account.token_version += 1
            changed = True
    db.flush()
    return "updated" if changed else "skipped"


def run_sync(
    db: Session,
    actor: models.UserAccount | None,
    payload: schemas.HRMSyncRequest,
    *,
    trigger: str = "manual",
) -> models.HRMSyncRun:
    if db.scalar(select(models.HRMSyncRun.id).where(models.HRMSyncRun.status == "running").limit(1)):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Đang có một đợt đồng bộ HRM/ERP khác chạy",
        )
    source, records = _source_records(payload)
    run = models.HRMSyncRun(
        source=source,
        trigger=trigger,
        status="running",
        actor_account_id=actor.id if actor else None,
        total_count=len(records),
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    for index, raw in enumerate(records, start=1):
        record_key = str(raw.get("external_id") or raw.get("email") or f"row-{index}")[:160]
        try:
            record = schemas.HRMEmployeeRecord.model_validate(raw)
            with db.begin_nested():
                outcome = _upsert_record(db, record)
            if outcome == "created":
                run.created_count += 1
            elif outcome == "updated":
                run.updated_count += 1
            else:
                run.skipped_count += 1
        except (ValidationError, ValueError, SQLAlchemyError) as exc:
            run.failed_count += 1
            if isinstance(exc, ValidationError):
                error_code = "invalid_record"
            elif isinstance(exc, ValueError):
                error_code = "mapping_conflict"
            else:
                error_code = "persistence_error"
            db.add(
                models.HRMSyncIssue(
                    run_id=run.id,
                    record_key=record_key,
                    error_code=error_code,
                    message=_safe_issue_message(exc),
                )
            )

    run.status = "completed_with_errors" if run.failed_count else "completed"
    run.finished_at = datetime.now(timezone.utc)
    db.add(
        models.AccountAuditLog(
            actor_account_id=actor.id if actor else None,
            action="hrm.sync.completed",
            detail=(
                f"run={run.id},source={source},created={run.created_count},"
                f"updated={run.updated_count},skipped={run.skipped_count},failed={run.failed_count}"
            ),
        )
    )
    db.commit()
    return db.scalar(
        select(models.HRMSyncRun)
        .options(selectinload(models.HRMSyncRun.issues))
        .where(models.HRMSyncRun.id == run.id)
    )


def history(
    db: Session,
    *,
    page: int,
    page_size: int,
    status_filter: str | None,
) -> schemas.HRMSyncPage:
    filters = []
    if status_filter:
        filters.append(models.HRMSyncRun.status == status_filter)
    total = db.scalar(select(func.count(models.HRMSyncRun.id)).where(*filters)) or 0
    items = list(
        db.scalars(
            select(models.HRMSyncRun)
            .options(selectinload(models.HRMSyncRun.issues))
            .where(*filters)
            .order_by(models.HRMSyncRun.started_at.desc(), models.HRMSyncRun.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        ).all()
    )
    return schemas.HRMSyncPage(
        items=[schemas.HRMSyncRunOut.model_validate(item) for item in items],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=max(1, math.ceil(total / page_size)),
    )
