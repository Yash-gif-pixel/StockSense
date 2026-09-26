"""Auth request/response models.

The password and login_id rules live here as reusable annotated types, so signup,
change-password and reset-password all enforce exactly the same thing and FastAPI
turns a violation into 422 validation_error with the field name as the key.
"""

import re
from datetime import datetime
from typing import Annotated

from pydantic import AfterValidator, BaseModel, ConfigDict, EmailStr

LOGIN_ID_PATTERN = re.compile(r"^[A-Za-z0-9_.]{6,12}$")
PASSWORD_MIN_LENGTH = 9

LOGIN_ID_MESSAGE = (
    "Login Id must be 6 to 12 characters long and may contain only letters, "
    "digits, underscores and dots"
)


def password_problem(value: str) -> str | None:
    """The single source of truth for password strength. None means acceptable."""
    if len(value) < PASSWORD_MIN_LENGTH:
        return f"Password must be at least {PASSWORD_MIN_LENGTH} characters long"
    if not any(c.islower() for c in value):
        return "Password must contain at least one lowercase letter"
    if not any(c.isupper() for c in value):
        return "Password must contain at least one uppercase letter"
    # "Special" = neither a letter, nor a digit, nor whitespace.
    if not any(
        not c.isalpha() and not c.isdigit() and not c.isspace() for c in value
    ):
        return "Password must contain at least one special character"
    return None


def _check_password(value: str) -> str:
    problem = password_problem(value)
    if problem is not None:
        raise ValueError(problem)
    return value


def _check_login_id(value: str) -> str:
    if not LOGIN_ID_PATTERN.fullmatch(value):
        raise ValueError(LOGIN_ID_MESSAGE)
    return value


Password = Annotated[str, AfterValidator(_check_password)]
LoginId = Annotated[str, AfterValidator(_check_login_id)]


class SignupRequest(BaseModel):
    login_id: LoginId
    email: EmailStr
    password: Password


class LoginRequest(BaseModel):
    # Deliberately unvalidated: a malformed login_id must fail as 401 with the
    # generic message, not leak that it could never have been a real account.
    login_id: str
    password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: Password


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    email: EmailStr
    otp: str
    new_password: Password


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    login_id: str
    email: str
    created_at: datetime


class MessageOut(BaseModel):
    message: str
