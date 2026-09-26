"""Shared schema building blocks.

Quantity/Money exist because Pydantic serializes a bare Decimal as a JSON *string*,
and the contract requires quantities and money to be JSON numbers.
"""

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
