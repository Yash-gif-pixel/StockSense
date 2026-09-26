"""Time helpers. "Today" is always evaluated in APP_TIMEZONE, per the contract's
late/upcoming definitions; stored timestamps are always UTC.
"""

from datetime import date, datetime, timezone

from app.core.config import settings


def now() -> datetime:
    return datetime.now(timezone.utc)


def today() -> date:
    return datetime.now(settings.timezone).date()
