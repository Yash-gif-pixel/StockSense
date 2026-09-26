"""Time helpers. "Today" is always evaluated in APP_TIMEZONE, per the contract's
late/upcoming definitions; stored timestamps are always UTC.
"""

from datetime import date, datetime, time, timedelta, timezone

from app.core.config import settings


def now() -> datetime:
    return datetime.now(timezone.utc)


def today() -> date:
    return datetime.now(settings.timezone).date()


def ensure_aware(value: datetime) -> datetime:
    """Guard for any caller-supplied instant. A naive datetime has no meaning without a
    zone, so it is refused rather than assumed to be UTC or local."""
    if value.tzinfo is None or value.tzinfo.utcoffset(value) is None:
        raise ValueError(
            f"Refusing the naive datetime {value!r}: an instant must be timezone-aware"
        )
    return value


def local_date(value: datetime) -> date:
    """The calendar date `value` falls on in APP_TIMEZONE."""
    return value.astimezone(settings.timezone).date()


def day_start(day: date) -> datetime:
    """Midnight at the start of `day` in APP_TIMEZONE, as an aware datetime.

    Used to turn an inclusive YYYY-MM-DD filter into a half-open instant range.
    """
    return datetime.combine(day, time.min, tzinfo=settings.timezone)


def day_after(day: date) -> datetime:
    """Midnight at the start of the following day in APP_TIMEZONE."""
    return day_start(day + timedelta(days=1))
