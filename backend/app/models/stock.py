from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from app.models.catalog import Location, Product
from app.models.enums import MoveDirection
from app.models.operation import Operation


class StockMove(Base):
    """Insert-only ledger entry. Never UPDATEd or DELETEd; corrections are new documents."""

    __tablename__ = "stock_moves"
    __table_args__ = (
        CheckConstraint("qty > 0", name="ck_stock_moves_qty_positive"),
        Index("ix_stock_moves_product_id", "product_id"),
        Index("ix_stock_moves_created_at", "created_at"),
        Index("ix_stock_moves_operation_id", "operation_id"),
        Index("ix_stock_moves_from_location_id", "from_location_id"),
        Index("ix_stock_moves_to_location_id", "to_location_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    operation_id: Mapped[int] = mapped_column(ForeignKey("operations.id"), nullable=False)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), nullable=False)
    from_location_id: Mapped[int] = mapped_column(ForeignKey("locations.id"), nullable=False)
    to_location_id: Mapped[int] = mapped_column(ForeignKey("locations.id"), nullable=False)
    qty: Mapped[Decimal] = mapped_column(Numeric(12, 3), nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    operation: Mapped[Operation] = relationship(lazy="joined")
    product: Mapped[Product] = relationship(lazy="joined")
    from_location: Mapped[Location] = relationship(
        foreign_keys=[from_location_id], lazy="joined"
    )
    to_location: Mapped[Location] = relationship(foreign_keys=[to_location_id], lazy="joined")

    @property
    def reference(self) -> str:
        """The contract puts the document reference on the move row itself."""
        return self.operation.reference

    @property
    def contact(self) -> str | None:
        return self.operation.contact

    @property
    def direction(self) -> MoveDirection:
        src_internal = self.from_location.is_internal
        dst_internal = self.to_location.is_internal
        if src_internal and dst_internal:
            return MoveDirection.internal
        return MoveDirection.out if src_internal else MoveDirection.in_


class StockQuant(Base):
    """Cached balance per (product, INTERNAL location). Written only by services/inventory.py."""

    __tablename__ = "stock_quants"
    __table_args__ = (
        CheckConstraint("quantity >= 0", name="ck_stock_quants_quantity_non_negative"),
        CheckConstraint("reserved >= 0", name="ck_stock_quants_reserved_non_negative"),
        Index("ix_stock_quants_location_id", "location_id"),
    )

    product_id: Mapped[int] = mapped_column(
        ForeignKey("products.id"), primary_key=True
    )
    location_id: Mapped[int] = mapped_column(
        ForeignKey("locations.id"), primary_key=True
    )
    quantity: Mapped[Decimal] = mapped_column(
        Numeric(12, 3), nullable=False, default=Decimal("0"), server_default=text("0")
    )
    reserved: Mapped[Decimal] = mapped_column(
        Numeric(12, 3), nullable=False, default=Decimal("0"), server_default=text("0")
    )

    # Deliberately NOT lazy="joined": these rows are read with SELECT ... FOR UPDATE,
    # and Postgres rejects row locking on the nullable side of an outer join.
    product: Mapped[Product] = relationship()
    location: Mapped[Location] = relationship()

    @property
    def free_to_use(self) -> Decimal:
        return self.quantity - self.reserved


class ReferenceSequence(Base):
    """Per-warehouse, per-type counter behind references like WH/IN/0001."""

    __tablename__ = "sequences"
    __table_args__ = (
        CheckConstraint(
            "op_type IN ('receipt', 'delivery', 'internal', 'adjustment')",
            name="ck_sequences_op_type",
        ),
    )

    warehouse_id: Mapped[int] = mapped_column(
        ForeignKey("warehouses.id"), primary_key=True
    )
    op_type: Mapped[str] = mapped_column(String(16), primary_key=True)
    next_value: Mapped[int] = mapped_column(
        Integer, nullable=False, default=1, server_default=text("1")
    )
