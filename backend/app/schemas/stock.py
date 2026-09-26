"""Stock read models and the adjust request/response."""

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import AdjustReason, StockStatus
from app.schemas.catalog import LocationOut, ProductOut
from app.schemas.common import NonNegativeQuantity, Quantity
from app.schemas.operation import OperationDetailOut


class StockRowOut(BaseModel):
    product: ProductOut
    on_hand: Quantity
    reserved: Quantity
    free_to_use: Quantity
    status: StockStatus


class StockLocationRowOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    location: LocationOut
    on_hand: Quantity
    reserved: Quantity
    free_to_use: Quantity


class AdjustRequest(BaseModel):
    product_id: int
    location_id: int
    counted_qty: NonNegativeQuantity
    reason: AdjustReason
    note: str | None = Field(default=None, max_length=2000)


class AdjustResponse(BaseModel):
    changed: bool
    operation: OperationDetailOut | None
