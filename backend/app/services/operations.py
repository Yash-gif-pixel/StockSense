"""Operation reads: the list query and the availability figures shown on a detail.

Read-only. Everything that writes stock lives in inventory.py.
"""

from decimal import Decimal

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.clock import today
from app.core.errors import NotFoundError, ValidationError
from app.models import (
    PENDING_STATUSES,
    Location,
    Operation,
    OperationLine,
    OperationStatus,
    OperationType,
    Product,
    StockQuant,
)
from app.schemas.common import Pagination

ZERO = Decimal("0")

#: The contract only defines source availability for an outgoing document still being
#: prepared; anywhere else the fields are null / false.
AVAILABILITY_TYPES = (OperationType.delivery, OperationType.internal)
AVAILABILITY_STATUSES = (OperationStatus.draft, OperationStatus.waiting)


def parse_statuses(raw: str | None) -> list[OperationStatus] | None:
    """The contract passes status as a comma-separated list."""
    if not raw:
        return None
    statuses = []
    for part in raw.split(","):
        value = part.strip()
        if not value:
            continue
        try:
            statuses.append(OperationStatus(value))
        except ValueError as exc:
            raise ValidationError(
                f"'{value}' is not a valid status",
                fields={"status": f"'{value}' is not a valid status"},
            ) from exc
    return statuses or None


def line_availability(db: Session, operation: Operation) -> dict[int, Decimal] | None:
    """free-to-use at the source per line id, or None when the contract says null."""
    if (
        operation.type not in AVAILABILITY_TYPES
        or operation.status not in AVAILABILITY_STATUSES
    ):
        return None

    quants = {
        product_id: quantity - reserved
        for product_id, quantity, reserved in db.execute(
            select(StockQuant.product_id, StockQuant.quantity, StockQuant.reserved).where(
                StockQuant.location_id == operation.source_location_id,
                StockQuant.product_id.in_([line.product_id for line in operation.lines]),
            )
        )
    }
    # A product with no quant row at the source simply has nothing free.
    return {line.id: quants.get(line.product_id, ZERO) for line in operation.lines}


def scope_conditions(warehouse_id: int | None = None, category_id: int | None = None):
    """Warehouse and category scoping, shared by the list and the dashboard.

    An operation belongs to a warehouse if either end of it does, and to a category if
    any of its lines does.
    """
    conditions = []
    if warehouse_id is not None:
        # Either end of the document may belong to the warehouse.
        source_warehouse = (
            select(Location.warehouse_id)
            .where(Location.id == Operation.source_location_id)
            .scalar_subquery()
        )
        dest_warehouse = (
            select(Location.warehouse_id)
            .where(Location.id == Operation.dest_location_id)
            .scalar_subquery()
        )
        conditions.append(
            or_(source_warehouse == warehouse_id, dest_warehouse == warehouse_id)
        )
    if category_id is not None:
        conditions.append(
            select(1)
            .select_from(OperationLine)
            .join(Product, Product.id == OperationLine.product_id)
            .where(
                OperationLine.operation_id == Operation.id,
                Product.category_id == category_id,
            )
            .exists()
        )
    return conditions


def _conditions(
    op_type: OperationType | None,
    statuses: list[OperationStatus] | None,
    warehouse_id: int | None,
    category_id: int | None,
    search: str | None,
    late: bool | None,
):
    conditions = scope_conditions(warehouse_id=warehouse_id, category_id=category_id)
    if op_type is not None:
        conditions.append(Operation.type == op_type)
    if statuses:
        conditions.append(Operation.status.in_(statuses))
    if search:
        pattern = f"%{search}%"
        conditions.append(
            or_(Operation.reference.ilike(pattern), Operation.contact.ilike(pattern))
        )
    if late is not None:
        is_late = Operation.status.in_(PENDING_STATUSES) & (
            Operation.scheduled_date < today()
        )
        conditions.append(is_late if late else ~is_late)
    return conditions


def list_operations(
    db: Session,
    pagination: Pagination,
    op_type: OperationType | None = None,
    statuses: list[OperationStatus] | None = None,
    warehouse_id: int | None = None,
    category_id: int | None = None,
    search: str | None = None,
    late: bool | None = None,
) -> tuple[list[Operation], int]:
    conditions = _conditions(op_type, statuses, warehouse_id, category_id, search, late)

    total = (
        db.scalar(select(func.count()).select_from(Operation).where(*conditions)) or 0
    )
    operations = (
        db.scalars(
            select(Operation)
            .where(*conditions)
            .order_by(Operation.created_at.desc(), Operation.id.desc())
            .limit(pagination.limit)
            .offset(pagination.offset)
        )
        .unique()
        .all()
    )
    return list(operations), total


def get_operation(db: Session, operation_id: int) -> Operation:
    operation = db.get(Operation, operation_id)
    if operation is None:
        raise NotFoundError("Operation not found")
    return operation
