"""Shared schema building blocks.

Quantity/Money exist because Pydantic serializes a bare Decimal as a JSON *string*,
and the contract requires quantities and money to be JSON numbers.

Timestamp exists because psycopg returns TIMESTAMPTZ columns as aware datetimes in the
*connection's* session TimeZone, and Pydantic then serializes that offset verbatim. On a
server whose TimeZone is Asia/Kolkata the same instant comes back as +05:30, while a
value we set in Python is UTC - so one response could carry both formats. Normalising
here, at the edge, is the only place that covers every field at once.
"""

from datetime import datetime, timezone
from decimal import Decimal
from typing import Annotated, Generic, TypeVar

from fastapi import Query
from pydantic import BaseModel, Field, PlainSerializer

T = TypeVar("T")

DEFAULT_LIMIT = 50
MAX_LIMIT = 200

_as_number = PlainSerializer(float, return_type=float, when_used="json")

Quantity = Annotated[Decimal, Field(max_digits=12, decimal_places=3), _as_number]
NonNegativeQuantity = Annotated[
    Decimal, Field(ge=0, max_digits=12, decimal_places=3), _as_number
]
Money = Annotated[Decimal, Field(ge=0, max_digits=12, decimal_places=2), _as_number]


def to_utc_z(value: datetime) -> str:
    """ISO 8601 in UTC with a trailing Z, per the contract.

    A naive datetime is a bug somewhere upstream, not something to paper over by
    assuming a zone, so it raises instead.
    """
    if value.tzinfo is None or value.tzinfo.utcoffset(value) is None:
        raise ValueError(
            f"Refusing to serialize the naive datetime {value!r}: "
            "timestamps must be timezone-aware"
        )
    return (
        value.astimezone(timezone.utc)
        .isoformat(timespec="microseconds")
        .replace("+00:00", "Z")
    )


#: Every timestamp in every response goes through this.
Timestamp = Annotated[
    datetime, PlainSerializer(to_utc_z, return_type=str, when_used="json")
]


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int


class Pagination(BaseModel):
    limit: int
    offset: int


def pagination(
    limit: int = Query(DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    offset: int = Query(0, ge=0),
) -> Pagination:
    return Pagination(limit=limit, offset=offset)
