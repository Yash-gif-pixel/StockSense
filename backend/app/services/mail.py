"""Outgoing email via stdlib smtplib.

With no SMTP_HOST configured: in development the OTP is logged so you can use it;
in production an error is logged and the OTP is never written to the log.
"""

import logging
import smtplib
from email.message import EmailMessage

from app.core.config import settings

logger = logging.getLogger(__name__)


def send_email(to: str, subject: str, body: str) -> None:
    message = EmailMessage()
    message["From"] = settings.SMTP_FROM
    message["To"] = to
    message["Subject"] = subject
    message.set_content(body)

    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15) as smtp:
        if settings.SMTP_TLS:
            smtp.starttls()
        if settings.SMTP_USER:
            smtp.login(settings.SMTP_USER, settings.SMTP_PASSWORD or "")
        smtp.send_message(message)


def send_otp_email(to: str, otp: str) -> None:
    """Never raises: a mail failure must not turn into a failed HTTP request."""
    subject = "Your StockSense password reset code"
    body = (
        f"Your StockSense password reset code is {otp}.\n\n"
        f"It expires in {settings.OTP_TTL_MINUTES} minutes and can be used once.\n"
        "If you did not request a password reset, you can ignore this email.\n"
    )

    if not settings.smtp_configured:
        if settings.ENV == "production":
            logger.error("SMTP is not configured; could not send reset code to %s", to)
        else:
            logger.warning("SMTP not configured; reset code for %s is %s", to, otp)
        return

    try:
        send_email(to, subject, body)
    except (smtplib.SMTPException, OSError):
        logger.exception("Failed to send the password reset email to %s", to)
