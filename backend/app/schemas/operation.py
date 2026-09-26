"""Operation and move schemas, shaped exactly as the contract defines them.

free_to_use_at_source / is_short depend on live stock rather than stored data, so
from_operation() takes the availability the caller computed. For adjustments, receipts
and anything already done or canceled they are null / false, per the contract.
"""

from datetime import date, datetime
from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field

from app.models import Operation, OperationStatus, OperationType, StockMove
from app.models.enums import MoveDirection
from app.schemas.catalog import LocationOut, ProductOut
from app.schemas.common import Quantity

PositiveQuantity = Annotated[Quantity, Field(gt=0)]


class OperationLineIn(BaseModel):
    product_id: int
    qty: PositiveQuantity


class OperationIn(BaseModel):
    """One body for all three types; which location fields are required depends on the
    type and is enforced in inventory.resolve_locations so the error names the field."""

    type: OperationType
    scheduled_date: date
    lines: list[OperationLineIn] = Field(min_length=1)
    contact: str | None = Field(default=None, max_length=200)
    delivery_address: str | None = Field(default=None, max_length=500)
    source_location_id: int | None = None
    dest_location_id: int | None = None


class ResponsibleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    login_id: str


class MoveProductOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    sku: str


class OperationLineOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    product: ProductOut
    qty: Quantity
    free_to_use_at_source: Quantity | None = None
    is_short: bool = False


class OperationSummaryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    reference: str
    type: OperationType
    status: OperationStatus
    contact: str | None
    source_location: LocationOut
    dest_location: LocationOut
    scheduled_date: date
    is_late: bool


class OperationDetailOut(OperationSummaryOut):
    delivery_address: str | None
    responsible: ResponsibleOut
    created_at: datetime
    validated_at: datetime | None
    lines: list[OperationLineOut]

    @classmethod
    def from_operation(
        cls,
        operation: Operation,
        availability: dict[int, Decimal] | None = None,
    ) -> "OperationDetailOut":
        """availability maps operation_line.id -> free-to-use at the source location."""
        detail = cls.model_validate(operation)
        if availability is None:
            return detail
        for line, model in zip(operation.lines, detail.lines, strict=True):
            free = availability.get(line.id)
            model.free_to_use_at_source = free
            model.is_short = free is not None and free < line.qty
        return detail


class MoveOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    reference: str
    operation_id: int
    contact: str | None
    product: MoveProductOut
    from_location: LocationOut
    to_location: LocationOut
    qty: Quantity
    direction: MoveDirection

    @classmethod
    def from_move(cls, move: StockMove) -> "MoveOut":
        return cls.model_validate(move)
