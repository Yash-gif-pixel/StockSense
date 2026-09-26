"""Shared router dependencies. Every authenticated router uses get_current_user."""

import jwt
from fastapi import Cookie, Depends
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.errors import UnauthorizedError
from app.core.security import COOKIE_NAME, decode_access_token
from app.models import User

NOT_AUTHENTICATED = "Not authenticated"


def get_current_user(
    access_token: str | None = Cookie(default=None, alias=COOKIE_NAME),
    db: Session = Depends(get_db),
) -> User:
    if not access_token:
        raise UnauthorizedError(NOT_AUTHENTICATED)

    try:
        payload = decode_access_token(access_token)
        user_id = int(payload["sub"])
    except (jwt.PyJWTError, KeyError, TypeError, ValueError) as exc:
        raise UnauthorizedError(NOT_AUTHENTICATED) from exc

    user = db.get(User, user_id)
    if user is None:
        raise UnauthorizedError(NOT_AUTHENTICATED)
    return user
