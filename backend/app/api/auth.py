from fastapi import APIRouter, BackgroundTasks, Depends, Response, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.db import get_db
from app.core.security import clear_auth_cookie, create_access_token, set_auth_cookie
from app.models import User
from app.schemas.auth import (
    ChangePasswordRequest,
    ForgotPasswordRequest,
    LoginRequest,
    MessageOut,
    ResetPasswordRequest,
    SignupRequest,
    UserOut,
)
from app.services import auth as auth_service

# Imported as a module (not the function) so tests can monkeypatch mail.send_otp_email.
from app.services import mail

router = APIRouter(prefix="/api/auth", tags=["auth"])

FORGOT_PASSWORD_MESSAGE = (
    "If that email address is registered, a password reset code has been sent to it."
)


@router.post("/signup", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def signup(payload: SignupRequest, db: Session = Depends(get_db)) -> User:
    user = auth_service.create_user(db, payload.login_id, payload.email, payload.password)
    db.commit()
    return user


@router.post("/login", response_model=UserOut)
def login(payload: LoginRequest, response: Response, db: Session = Depends(get_db)) -> User:
    user = auth_service.authenticate(db, payload.login_id, payload.password)
    set_auth_cookie(response, create_access_token(user.id))
    return user


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(current_user: User = Depends(get_current_user)) -> Response:
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    clear_auth_cookie(response)
    return response


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)) -> User:
    return current_user


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(
    payload: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    auth_service.change_password(
        db, current_user, payload.current_password, payload.new_password
    )
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/forgot-password", response_model=MessageOut)
def forgot_password(
    payload: ForgotPasswordRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> MessageOut:
    otp = auth_service.issue_password_reset(db, payload.email)
    db.commit()
    # Sent after the response so a known and an unknown email take the same time.
    if otp is not None:
        background_tasks.add_task(mail.send_otp_email, payload.email.lower(), otp)
    return MessageOut(message=FORGOT_PASSWORD_MESSAGE)


@router.post("/reset-password", status_code=status.HTTP_204_NO_CONTENT)
def reset_password(payload: ResetPasswordRequest, db: Session = Depends(get_db)) -> Response:
    auth_service.reset_password(db, payload.email, payload.otp, payload.new_password)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
