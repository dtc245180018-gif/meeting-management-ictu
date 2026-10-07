from __future__ import annotations

import math
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from . import models, schemas
from .config import get_settings
from .passwords import hash_password, verify_password


def account_query():
    return select(models.UserAccount).options(selectinload(models.UserAccount.employee))


def account_to_out(account: models.UserAccount) -> schemas.AccountOut:
    return schemas.AccountOut(
        id=account.id,
        employee_id=account.employee_id,
        email=account.email,
        full_name=account.employee.full_name,
        department=account.employee.department,
        role=account.role,
        must_change_password=account.must_change_password,
        is_active=account.is_active,
        last_login_at=account.last_login_at,
        created_at=account.created_at,
    )


def authenticate(db: Session, email: str, password: str) -> models.UserAccount:
    normalized = email.strip().lower()
    account = db.scalar(account_query().where(func.lower(models.UserAccount.email) == normalized))
    if account is None or not account.is_active or not verify_password(password, account.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email hoặc mật khẩu không đúng",
        )
    account.last_login_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(account)
    return account


def change_password(
    db: Session,
    account: models.UserAccount,
    current_password: str,
    new_password: str,
) -> models.UserAccount:
    if not verify_password(current_password, account.password_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Mật khẩu hiện tại không đúng")
    account.password_hash = hash_password(new_password)
    account.must_change_password = False
    account.password_changed_at = datetime.now(timezone.utc)
    account.token_version += 1
    db.commit()
    db.refresh(account)
    return account


def revoke_tokens(db: Session, account: models.UserAccount) -> None:
    account.token_version += 1
    db.commit()


def _audit(
    db: Session,
    actor: models.UserAccount,
    action: str,
    target: models.UserAccount | None = None,
    detail: str | None = None,
) -> None:
    db.add(
        models.AccountAuditLog(
            actor_account_id=actor.id,
            target_account_id=target.id if target else None,
            action=action,
            detail=detail,
        )
    )


def list_accounts(
    db: Session,
    *,
    search: str | None,
    role: models.AccountRole | None,
    is_active: bool | None,
    page: int,
    page_size: int,
) -> schemas.AccountPage:
    filters = []
    if search and search.strip():
        pattern = f"%{search.strip().lower()}%"
        filters.append(
            or_(
                func.lower(models.UserAccount.email).like(pattern),
                func.lower(models.Employee.full_name).like(pattern),
                func.lower(models.Employee.department).like(pattern),
            )
        )
    if role is not None:
        filters.append(models.UserAccount.role == role)
    if is_active is not None:
        filters.append(models.UserAccount.is_active.is_(is_active))

    base = select(models.UserAccount).join(models.Employee).where(*filters)
    total = db.scalar(select(func.count()).select_from(base.subquery())) or 0
    items = list(
        db.scalars(
            base.options(selectinload(models.UserAccount.employee))
            .order_by(models.Employee.full_name, models.UserAccount.id)
            .offset((page - 1) * page_size)
            .limit(page_size)
        ).all()
    )
    return schemas.AccountPage(
        items=[account_to_out(item) for item in items],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=max(1, math.ceil(total / page_size)),
    )


def create_account(
    db: Session,
    actor: models.UserAccount,
    payload: schemas.AccountCreate,
) -> models.UserAccount:
    normalized = str(payload.email).strip().lower()
    if db.scalar(select(models.UserAccount.id).where(func.lower(models.UserAccount.email) == normalized)):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email đăng nhập đã tồn tại")

    employee = db.scalar(select(models.Employee).where(func.lower(models.Employee.email) == normalized))
    if employee is None:
        employee = models.Employee(
            full_name=payload.full_name.strip(),
            email=normalized,
            department=payload.department.strip(),
            is_active=True,
        )
        db.add(employee)
        db.flush()
    elif employee.account is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Nhân viên đã có tài khoản")
    else:
        employee.full_name = payload.full_name.strip()
        employee.department = payload.department.strip()
        employee.is_active = True

    account = models.UserAccount(
        employee=employee,
        email=normalized,
        password_hash=hash_password(get_settings().initial_account_password),
        role=payload.role,
        must_change_password=True,
        is_active=True,
    )
    db.add(account)
    db.flush()
    _audit(db, actor, "account.created", account, f"role={payload.role.value}")
    db.commit()
    return db.scalar(account_query().where(models.UserAccount.id == account.id))


def _active_admin_count(db: Session, *, lock: bool = False) -> int:
    if lock:
        return len(
            db.scalars(
                select(models.UserAccount.id)
                .where(
                    models.UserAccount.role == models.AccountRole.ADMIN,
                    models.UserAccount.is_active.is_(True),
                )
                .order_by(models.UserAccount.id)
                .with_for_update()
            ).all()
        )
    return db.scalar(
        select(func.count(models.UserAccount.id)).where(
            models.UserAccount.role == models.AccountRole.ADMIN,
            models.UserAccount.is_active.is_(True),
        )
    ) or 0


def update_account(
    db: Session,
    actor: models.UserAccount,
    account_id: int,
    payload: schemas.AccountUpdate,
) -> models.UserAccount:
    account = db.scalar(account_query().where(models.UserAccount.id == account_id))
    if account is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy tài khoản")

    removing_active_admin = (
        account.role == models.AccountRole.ADMIN
        and account.is_active
        and (
            payload.role is not None and payload.role != models.AccountRole.ADMIN
            or payload.is_active is False
        )
    )
    if removing_active_admin and _active_admin_count(db, lock=True) <= 1:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Không thể hạ quyền hoặc khóa quản trị viên cuối cùng",
        )

    changes: list[str] = []
    if payload.full_name is not None:
        account.employee.full_name = payload.full_name.strip()
        changes.append("full_name")
    if payload.department is not None:
        account.employee.department = payload.department.strip()
        changes.append("department")
    if payload.role is not None and payload.role != account.role:
        account.role = payload.role
        account.token_version += 1
        changes.append(f"role={payload.role.value}")
    if payload.is_active is not None and payload.is_active != account.is_active:
        account.is_active = payload.is_active
        account.employee.is_active = payload.is_active
        account.token_version += 1
        changes.append(f"active={payload.is_active}")
    if payload.reset_password:
        account.password_hash = hash_password(get_settings().initial_account_password)
        account.must_change_password = True
        account.token_version += 1
        changes.append("password_reset")

    _audit(db, actor, "account.updated", account, ",".join(changes) or "no_change")
    db.commit()
    return db.scalar(account_query().where(models.UserAccount.id == account.id))


def room_permissions(db: Session, account_id: int) -> list[schemas.RoomPermissionOut]:
    account = db.get(models.UserAccount, account_id)
    if account is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy tài khoản")
    policies = {
        policy.room_id: policy
        for policy in db.scalars(
            select(models.RoomAccessPolicy).where(models.RoomAccessPolicy.account_id == account_id)
        ).all()
    }
    rooms = db.scalars(select(models.Room).order_by(models.Room.name)).all()
    return [
        schemas.RoomPermissionOut(
            account_id=account_id,
            room_id=room.id,
            room_name=room.name,
            can_book=policies[room.id].can_book if room.id in policies else True,
            reason=policies[room.id].reason if room.id in policies else None,
        )
        for room in rooms
    ]


def update_room_permission(
    db: Session,
    actor: models.UserAccount,
    account_id: int,
    room_id: int,
    payload: schemas.RoomPermissionUpdate,
) -> schemas.RoomPermissionOut:
    account = db.get(models.UserAccount, account_id)
    room = db.get(models.Room, room_id)
    if account is None or room is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy tài khoản hoặc phòng")
    policy = db.scalar(
        select(models.RoomAccessPolicy).where(
            models.RoomAccessPolicy.account_id == account_id,
            models.RoomAccessPolicy.room_id == room_id,
        )
    )
    if policy is None:
        policy = models.RoomAccessPolicy(account_id=account_id, room_id=room_id)
        db.add(policy)
    policy.can_book = payload.can_book
    policy.reason = payload.reason.strip() if payload.reason else None
    _audit(db, actor, "room_permission.updated", account, f"room={room_id},can_book={payload.can_book}")
    db.commit()
    return schemas.RoomPermissionOut(
        account_id=account_id,
        room_id=room_id,
        room_name=room.name,
        can_book=policy.can_book,
        reason=policy.reason,
    )


def room_access(db: Session, account_id: int | None, room_id: int) -> tuple[bool, str | None]:
    if account_id is None:
        return True, None
    policy = db.scalar(
        select(models.RoomAccessPolicy).where(
            models.RoomAccessPolicy.account_id == account_id,
            models.RoomAccessPolicy.room_id == room_id,
        )
    )
    if policy is None:
        return True, None
    return policy.can_book, policy.reason


def ensure_room_access(db: Session, account_id: int | None, room_id: int) -> None:
    allowed, reason = room_access(db, account_id, room_id)
    if not allowed:
        detail = "Bạn không được phép đặt phòng này"
        if reason:
            detail += f": {reason}"
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=detail)
