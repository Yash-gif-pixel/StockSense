"""Warehouse, location, category and product schemas."""

from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from app.models.enums import LocationType
from app.schemas.common import Money, NonNegativeQuantity

WarehouseShortCode = Annotated[str, StringConstraints(pattern=r"^[A-Za-z0-9]{1,8}$")]
LocationShortCode = Annotated[str, StringConstraints(pattern=r"^[A-Za-z0-9_-]{1,16}$")]
Name = Annotated[str, StringConstraints(min_length=1, max_length=120, strip_whitespace=True)]
Sku = Annotated[str, StringConstraints(min_length=1, max_length=64, strip_whitespace=True)]
Uom = Annotated[str, StringConstraints(min_length=1, max_length=24, strip_whitespace=True)]


class WarehouseIn(BaseModel):
    name: Name
    short_code: WarehouseShortCode
    address: str | None = Field(default=None, max_length=500)


class WarehouseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    short_code: str
    address: str | None


class LocationIn(BaseModel):
    warehouse_id: int
    name: Name
    short_code: LocationShortCode


class LocationUpdate(BaseModel):
    name: Name
    short_code: LocationShortCode


class LocationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    warehouse_id: int | None
    name: str
    short_code: str
    full_name: str
    type: LocationType


class CategoryIn(BaseModel):
    name: Name


class CategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str


class ProductIn(BaseModel):
    name: Name
    sku: Sku
    category_id: int | None = None
    uom: Uom
    unit_cost: Money
    min_qty: NonNegativeQuantity | None = None
    initial_qty: NonNegativeQuantity | None = None
    initial_location_id: int | None = None


class ProductUpdate(BaseModel):
    name: Name
    sku: Sku
    category_id: int | None = None
    uom: Uom
    unit_cost: Money
    min_qty: NonNegativeQuantity | None = None
    active: bool = True


class ProductOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    sku: str
    category: CategoryOut | None
    uom: str
    unit_cost: Money
    min_qty: NonNegativeQuantity | None
    active: bool
