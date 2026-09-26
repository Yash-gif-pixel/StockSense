from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.clock import today
from app.models.base import Base
from app.models.catalog import Location, Product
from app.models.enums import OperationStatus, OperationType
from app.models.user import User

PENDING_STATUSES = (
    OperationStatus.draft,
    OperationStatus.waiting,
    OperationStatus.ready,
)


class Operation(Base):
    __tablename__ = "operations"
    __table_args__ = (
        CheckConstraint(
            "reason IS NULL OR reason IN ('count', 'damaged', 'lost', 'other')",
            name="ck_operations_reason",
        ),
        Index("ix_operations_type", "type"),
        Index("ix_operations_status", "status"),
        Index("ix_operations_scheduled_date", "scheduled_date"),
        Index("ix_operations_source_location_id", "source_location_id"),
        Index("ix_operations_dest_location_id", "dest_location_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    reference: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    type: Mapped[OperationType] = mapped_column(
        Enum(
            OperationType,
            name="operation_type",
            values_callable=lambda e: [m.value for m in e],
        ),
        nullable=False,
    )
    status: Mapped[OperationStatus] = mapped_column(
        Enum(
            OperationStatus,
            name="operation_status",
            values_callable=lambda e: [m.value for m in e],
        ),
        nullable=False,
    )
    contact: Mapped[str | None] = mapped_column(String(200), nullable=True)
    delivery_address: Mapped[str | None] = mapped_column(String(500), nullable=True)
    source_location_id: Mapped[int] = mapped_column(ForeignKey("locations.id"), nullable=False)
    dest_location_id: Mapped[int] = mapped_column(ForeignKey("locations.id"), nullable=False)
    scheduled_date: Mapped[date] = mapped_column(Date, nullable=False)
    responsible_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    validated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # Only set on adjustments; the contract has no field for them on other types.
    reason: Mapped[str | None] = mapped_column(String(16), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    source_location: Mapped[Location] = relationship(
        foreign_keys=[source_location_id], lazy="joined"
    )
    dest_location: Mapped[Location] = relationship(
        foreign_keys=[dest_location_id], lazy="joined"
    )
    responsible: Mapped[User] = relationship(lazy="joined")
    lines: Mapped[list["OperationLine"]] = relationship(
        back_populates="operation",
        cascade="all, delete-orphan",
        order_by="OperationLine.id",
    )

    @property
    def is_pending(self) -> bool:
        return self.status in PENDING_STATUSES

    @property
    def is_late(self) -> bool:
        return self.is_pending and self.scheduled_date < today()


class OperationLine(Base):
    __tablename__ = "operation_lines"
    __table_args__ = (
        CheckConstraint("qty > 0", name="ck_operation_lines_qty_positive"),
        Index("ix_operation_lines_operation_id", "operation_id"),
        Index("ix_operation_lines_product_id", "product_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    operation_id: Mapped[int] = mapped_column(
        ForeignKey("operations.id", ondelete="CASCADE"), nullable=False
    )
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), nullable=False)
    qty: Mapped[Decimal] = mapped_column(Numeric(12, 3), nullable=False)

    operation: Mapped[Operation] = relationship(back_populates="lines")
    product: Mapped[Product] = relationship(lazy="joined")
