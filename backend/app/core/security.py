"""Password hashing, JWT issuing/decoding, and the auth cookie.

PyJWT 2.15 rejects a non-string "sub" on decode (InvalidSubjectError), so the user id
is always encoded as a string. It also warns when the HMAC key is under 32 bytes.
"""

import hashlib
import hmac
from datetime import datetime, timedelta, timezone
from typing import Any

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError
from fastapi import Response

from app.core.config import settings

ALGORITHM = "HS256"
COOKIE_NAME = "access_token"

_hasher = PasswordHasher()


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except (VerifyMismatchError, InvalidHashError, ValueError):
        return False


def create_access_token(user_id: int) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "iat": now,
        "exp": now + timedelta(hours=settings.TOKEN_TTL_HOURS),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict[str, Any]:
    """Raises jwt.PyJWTError on a bad signature, expiry, or non-string sub."""
    return jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])


def token_max_age_seconds() -> int:
    return settings.TOKEN_TTL_HOURS * 3600


def set_auth_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        max_age=token_max_age_seconds(),
        path="/",
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure,
    )


def clear_auth_cookie(response: Response) -> None:
    response.delete_cookie(
        key=COOKIE_NAME,
        path="/",
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure,
    )


def hash_otp(otp: str) -> str:
    """HMAC-SHA256 of the OTP keyed by SECRET_KEY. The OTP itself is never stored."""
    return hmac.new(
        settings.SECRET_KEY.encode(), otp.encode(), hashlib.sha256
    ).hexdigest()
