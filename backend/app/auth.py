"""Signed bearer authentication and role checks for Sprint 3."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from datetime import datetime, timezone
from typing import Iterable

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from . import models
from .config import Settings, get_settings
from .database import get_db


bearer = HTTPBearer(auto_error=False)


def _encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def _decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def _secret(settings: Settings) -> bytes:
    # Existing Sprint 2 installations already have an OAuth state signing
    # secret. It is a safe migration fallback until AUTH_SECRET_KEY is set.
    secret = (settings.auth_secret_key or settings.google_oauth_state_secret).strip()
    if len(secret) < 32:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AUTH_SECRET_KEY chưa được cấu hình an toàn",
        )
    return secret.encode("utf-8")


def create_access_token(account: models.UserAccount, settings: Settings | None = None) -> str:
    current_settings = settings or get_settings()
    now = int(time.time())
    payload = {
        "sub": account.id,
        "email": account.email,
        "role": account.role.value,
        "ver": account.token_version,
        "iat": now,
        "exp": now + current_settings.auth_token_minutes * 60,
    }
    encoded = _encode(json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8"))
    signature = _encode(hmac.new(_secret(current_settings), encoded.encode("ascii"), hashlib.sha256).digest())
    return f"{encoded}.{signature}"


def decode_access_token(token: str, settings: Settings | None = None) -> dict:
    current_settings = settings or get_settings()
    try:
        encoded, signature = token.split(".", 1)
        expected = _encode(hmac.new(_secret(current_settings), encoded.encode("ascii"), hashlib.sha256).digest())
        if not hmac.compare_digest(signature, expected):
            raise ValueError("signature")
        payload = json.loads(_decode(encoded))
        if int(payload["exp"]) <= int(time.time()):
            raise ValueError("expired")
        return payload
    except HTTPException:
        raise
    except (ValueError, KeyError, TypeError, json.JSONDecodeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Phiên đăng nhập không hợp lệ hoặc đã hết hạn",
            headers={"WWW-Authenticate": "Bearer"},
        ) from None


def get_current_account(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> models.UserAccount | None:
    if credentials is None:
        if not settings.auth_required:
            return None
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Bạn cần đăng nhập để tiếp tục",
            headers={"WWW-Authenticate": "Bearer"},
        )
    payload = decode_access_token(credentials.credentials, settings)
    account = db.get(models.UserAccount, int(payload.get("sub", 0)))
    if (
        account is None
        or not account.is_active
        or account.token_version != int(payload.get("ver", -1))
        or account.email != payload.get("email")
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Tài khoản đã bị khóa hoặc phiên đăng nhập đã bị thu hồi",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if account.must_change_password and request.url.path not in {
        "/api/auth/me",
        "/api/auth/change-password",
        "/api/auth/logout",
    }:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn phải đổi mật khẩu tạm thời trước khi sử dụng hệ thống",
        )
    return account


def require_account(account: models.UserAccount | None = Depends(get_current_account)) -> models.UserAccount:
    if account is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Bạn cần đăng nhập để tiếp tục")
    return account


def require_role(account: models.UserAccount, allowed: Iterable[models.AccountRole]) -> models.UserAccount:
    if account.role not in set(allowed):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bạn không có quyền thực hiện thao tác này")
    return account


def require_admin(account: models.UserAccount = Depends(require_account)) -> models.UserAccount:
    return require_role(account, {models.AccountRole.ADMIN})


def require_organizer(account: models.UserAccount = Depends(require_account)) -> models.UserAccount:
    return require_role(account, {models.AccountRole.ADMIN, models.AccountRole.ORGANIZER})


def account_from_request(request: Request, db: Session) -> models.UserAccount | None:
    """Reserved for background/task code that has an authenticated request."""
    account_id = getattr(request.state, "account_id", None)
    return db.get(models.UserAccount, account_id) if account_id else None


def utc_now() -> datetime:
    return datetime.now(timezone.utc)
