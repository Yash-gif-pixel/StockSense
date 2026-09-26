from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Numeric,
    String,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from app.models.enums import LocationType


class Warehouse(Base):
    __tablename__ = "warehouses"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    short_code: Mapped[str] = mapped_column(String(12), unique=True, nullable=False)
    address: Mapped[str | None] = mapped_column(String(500), nullable=True)

    locations: Mapped[list["Location"]] = relationship(back_populates="warehouse")


class Location(Base):
    __tablename__ = "locations"
    __table_args__ = (
        # NULL warehouse_id (virtual locations) is exempt: Postgres treats NULLs as distinct.
        UniqueConstraint("warehouse_id", "short_code", name="uq_locations_warehouse_short_code"),
        Index("ix_locations_warehouse_id", "warehouse_id"),
        Index("ix_locations_type", "type"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    warehouse_id: Mapped[int | None] = mapped_column(
        ForeignKey("warehouses.id"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    short_code: Mapped[str] = mapped_column(String(24), nullable=False)
    type: Mapped[LocationType] = mapped_column(
        Enum(
            LocationType,
            name="location_type",
            values_callable=lambda e: [m.value for m in e],
        ),
        nullable=False,
    )

    warehouse: Mapped[Warehouse | None] = relationship(
        back_populates="locations", lazy="joined"
    )

    @property
    def full_name(self) -> str:
        """"WH/Stock1" for internal locations, plain name for virtual ones."""
        if self.warehouse is not None:
            return f"{self.warehouse.short_code}/{self.name}"
        return self.name

    @property
    def is_internal(self) -> bool:
        return self.type is LocationType.internal


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)


class Product(Base):
    __tablename__ = "products"
    __table_args__ = (Index("ix_products_category_id", "category_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    sku: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    category_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id"), nullable=True)
    uom: Mapped[str] = mapped_column(String(24), nullable=False)
    unit_cost: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, default=Decimal("0"), server_default=text("0")
    )
    min_qty: Mapped[Decimal | None] = mapped_column(Numeric(12, 3), nullable=True)
    active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=text("true")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    category: Mapped[Category | None] = relationship(lazy="joined")
