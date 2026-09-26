"""Dashboard response, shaped exactly as the contract defines it."""

from pydantic import BaseModel


class OperationCounts(BaseModel):
    ready: int
    waiting: int
    late: int
    upcoming: int
    pending: int


class InternalCounts(BaseModel):
    scheduled: int


class ProductCounts(BaseModel):
    in_stock: int
    low_stock: int
    out_of_stock: int


class DashboardOut(BaseModel):
    receipts: OperationCounts
    deliveries: OperationCounts
    internal: InternalCounts
    products: ProductCounts
