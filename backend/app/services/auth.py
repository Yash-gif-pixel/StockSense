"""Auth business rules: account creation, login, and the password-reset OTP lifecycle."""

import hmac
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import (
    BadRequestError,
    ConflictError,
    InvalidOtpError,
    UnauthorizedError,
)
from app.core.security import hash_otp, hash_password, verify_password
from app.models import PasswordReset, User

INVALID_CREDENTIALS_MESSAGE = "Invalid Login Id or Password"

# Verified against this when the login_id is unknown, so a missing account costs the
# same time as a wrong password and cannot be detected by timing.
_DUMMY_PASSWORD_HASH = hash_password(secrets.token_urlsafe(32))


def _now() -> datetime:
    return datetime.now(timezone.utc)


def create_user(db: Session, login_id: str, email: str, password: str) -> User:
    """login_id is case-sensitive as entered; email is normalised to lowercase."""
    email = email.lower()

    if db.scalar(select(User.id).where(User.login_id == login_id)) is not None:
        raise ConflictError(
            "That Login Id is already taken", fields={"login_id": "Already registered"}
        )
    if db.scalar(select(User.id).where(User.email == email)) is not None:
        raise ConflictError(
            "That email is already registered", fields={"email": "Already registered"}
        )

    user = User(login_id=login_id, email=email, password_hash=hash_password(password))
    db.add(user)
    try:
        db.flush()
    except IntegrityError as exc:  # concurrent signup won the race
        db.rollback()
        raise ConflictError("That Login Id or email is already registered") from exc
    return user


def authenticate(db: Session, login_id: str, password: str) -> User:
    user = db.scalar(select(User).where(User.login_id == login_id))
    if user is None:
        verify_password(password, _DUMMY_PASSWORD_HASH)
        raise UnauthorizedError(INVALID_CREDENTIALS_MESSAGE)
    if not verify_password(password, user.password_hash):
        raise UnauthorizedError(INVALID_CREDENTIALS_MESSAGE)
    return user


def change_password(db: Session, user: User, current_password: str, new_password: str) -> None:
    if not verify_password(current_password, user.password_hash):
        raise BadRequestError(
            "Current password is incorrect",
            fields={"current_password": "Current password is incorrect"},
        )
    user.password_hash = hash_password(new_password)
    db.flush()


def issue_password_reset(db: Session, email: str) -> str | None:
    """Invalidate the user's older unused OTPs and issue a new one.

    Returns the plaintext OTP for the caller to email, or None if no such user —
    the caller must respond identically either way.
    """
    user = db.scalar(select(User).where(User.email == email.lower()))
    if user is None:
        return None

    db.execute(
        update(PasswordReset)
        .where(PasswordReset.user_id == user.id, PasswordReset.used_at.is_(None))
        .values(used_at=_now())
    )

    otp = f"{secrets.randbelow(1_000_000):06d}"
    db.add(
        PasswordReset(
            user_id=user.id,
            otp_hash=hash_otp(otp),
            expires_at=_now() + timedelta(minutes=settings.OTP_TTL_MINUTES),
        )
    )
    db.flush()
    return otp


def reset_password(db: Session, email: str, otp: str, new_password: str) -> None:
    """Consume the latest valid OTP. Every failure looks the same: invalid_otp."""
    user = db.scalar(select(User).where(User.email == email.lower()))
    if user is None:
        raise InvalidOtpError()

    reset = db.scalar(
        select(PasswordReset)
        .where(
            PasswordReset.user_id == user.id,
            PasswordReset.used_at.is_(None),
            PasswordReset.expires_at > _now(),
        )
        .order_by(PasswordReset.id.desc())
        .limit(1)
    )
    if reset is None or reset.attempts >= settings.OTP_MAX_ATTEMPTS:
        raise InvalidOtpError()

    if not hmac.compare_digest(reset.otp_hash, hash_otp(otp)):
        reset.attempts += 1
        db.commit()
        raise InvalidOtpError()

    reset.used_at = _now()
    user.password_hash = hash_password(new_password)
    db.flush()
