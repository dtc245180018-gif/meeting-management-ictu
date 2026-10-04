"""Password primitives for the Sprint 3 authentication foundation."""

from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
import string


ALGORITHM = "pbkdf2_sha256"
PBKDF2_ITERATIONS = 600_000
SALT_BYTES = 16
TEMPORARY_PASSWORD_LENGTH = 18


def _encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _decode(encoded: str) -> bytes:
    return base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4))


def hash_password(password: str, *, iterations: int = PBKDF2_ITERATIONS) -> str:
    if not password:
        raise ValueError("Password must not be empty")

    salt = secrets.token_bytes(SALT_BYTES)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt, iterations
    )
    return f"{ALGORITHM}${iterations}${_encode(salt)}${_encode(digest)}"


def verify_password(password: str, encoded_hash: str) -> bool:
    try:
        algorithm, iterations_text, salt_text, digest_text = encoded_hash.split("$", 3)
        if algorithm != ALGORITHM:
            return False
        iterations = int(iterations_text)
        salt = _decode(salt_text)
        expected = _decode(digest_text)
    except (TypeError, ValueError):
        return False

    actual = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt, iterations
    )
    return hmac.compare_digest(actual, expected)


def generate_temporary_password(length: int = TEMPORARY_PASSWORD_LENGTH) -> str:
    if length < 12:
        raise ValueError("Temporary passwords must contain at least 12 characters")

    required = [
        secrets.choice(string.ascii_uppercase),
        secrets.choice(string.ascii_lowercase),
        secrets.choice(string.digits),
        secrets.choice("!@#$%"),
    ]
    alphabet = string.ascii_letters + string.digits + "!@#$%"
    password = required + [secrets.choice(alphabet) for _ in range(length - len(required))]
    secrets.SystemRandom().shuffle(password)
    return "".join(password)
