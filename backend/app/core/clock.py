"""Time helpers. "Today" is always evaluated in APP_TIMEZONE, per the contract's
late/upcoming definitions; stored timestamps are always UTC.
"""

from datetime import date, datetime, time, timedelta, timezone

from app.core.config import settings


def now() -> datetime:
    return datetime.now(timezone.utc)


def today() -> date:
    return datetime.now(settings.timezone).date()


def day_start(day: date) -> datetime:
    """Midnight at the start of `day` in APP_TIMEZONE, as an aware datetime.

    Used to turn an inclusive YYYY-MM-DD filter into a half-open instant range.
    """
    return datetime.combine(day, time.min, tzinfo=settings.timezone)


def day_after(day: date) -> datetime:
    """Midnight at the start of the following day in APP_TIMEZONE."""
    return day_start(day + timedelta(days=1))
