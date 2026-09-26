"""The stock ledger. This is the ONLY module allowed to write stock_quants or stock_moves.

Transactions: every function here does its work inside the caller's transaction and
never commits. The caller owns the commit, so that e.g. creating a product and booking
its initial stock land atomically. Callers must commit or the work is discarded.

Locking: quant rows are always locked in (product_id, location_id) order so concurrent
operations touching overlapping products cannot deadlock.
"""

from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.core.clock import now, today
from app.core.errors import (
    ConflictError,
    InsufficientStockError,
    InvalidStateError,
    NotFoundError,
    ValidationError,
)
from app.models import (
    Location,
    LocationType,
    Operation,
    OperationLine,
    OperationStatus,
    OperationType,
    Product,
    StockMove,
    StockQuant,
    User,
)
from app.services.sequences import next_reference

ZERO = Decimal("0")

#: A receipt comes from Vendors, a delivery goes to Customers; the user never picks these.
COUNTERPART_TYPE = {
    OperationType.receipt: LocationType.vendor,
    OperationType.delivery: LocationType.customer,
}

#: Statuses in which a delivery/internal transfer holds reservations.
RESERVING_TYPES = (OperationType.delivery, OperationType.internal)

CANCELABLE_STATUSES = (
    OperationStatus.draft,
    OperationStatus.waiting,
    OperationStatus.ready,
)


@dataclass(frozen=True)
class LineInput:
    product_id: int
    qty: Decimal


def virtual_location(db: Session, location_type: LocationType) -> Location:
    location = db.scalar(
        select(Location)
        .where(Location.type == location_type)
        .order_by(Location.id)
        .limit(1)
    )
    if location is None:
        raise ConflictError(
            f"No {location_type.value} location exists; run the seed"
        )
    return location


def get_adjustment_location(db: Session) -> Location:
    return virtual_location(db, LocationType.adjustment)


def lock_quant(db: Session, product_id: int, location_id: int) -> StockQuant:
    """Return the quant row for this pair, locked FOR UPDATE, creating it at zero if absent.

    The INSERT ... ON CONFLICT DO NOTHING means two transactions racing to create the
    same quant both end up with a row, and whichever loses the race simply locks it.
    """
    db.execute(
        pg_insert(StockQuant)
        .values(product_id=product_id, location_id=location_id, quantity=ZERO, reserved=ZERO)
        .on_conflict_do_nothing(index_elements=["product_id", "location_id"])
    )
    quant = db.scalar(
        select(StockQuant)
        .where(StockQuant.product_id == product_id, StockQuant.location_id == location_id)
        .with_for_update()
    )
    if quant is None:  # pragma: no cover - the insert above guarantees a row
        raise ConflictError("Could not lock the stock row")
    return quant


def lock_quants(
    db: Session, pairs: list[tuple[int, int]]
) -> dict[tuple[int, int], StockQuant]:
    """Lock several quants in a deterministic order to avoid deadlocks."""
    return {pair: lock_quant(db, *pair) for pair in sorted(set(pairs))}


def _require_internal_location(db: Session, location_id: int) -> Location:
    location = db.get(Location, location_id)
    if location is None:
        raise NotFoundError("Location not found")
    if not location.is_internal:
        raise ValidationError(
            "Stock can only be held in an internal location",
            fields={"location_id": "Must be an internal location"},
        )
    return location


def adjust(
    db: Session,
    user: User,
    product_id: int,
    location_id: int,
    counted_qty: Decimal,
    reason: str,
    note: str | None = None,
) -> tuple[bool, Operation | None]:
    """Set a product's quantity at one internal location to the counted figure.

    Returns (changed, operation). A count that matches what we already believe writes
    nothing at all and consumes no reference.
    """
    if counted_qty < ZERO:
        raise ValidationError(
            "Counted quantity cannot be negative",
            fields={"counted_qty": "Must be zero or greater"},
        )

    product = db.get(Product, product_id)
    if product is None:
        raise NotFoundError("Product not found")
    location = _require_internal_location(db, location_id)

    quant = lock_quant(db, product_id, location_id)
    diff = counted_qty - quant.quantity
    if diff == ZERO:
        return False, None

    if counted_qty < quant.reserved:
        raise ConflictError(
            f"{quant.reserved} is reserved at this location; cannot count below that",
            fields={"counted_qty": "Below the reserved quantity"},
        )

    adjustment_location = get_adjustment_location(db)
    if diff > ZERO:
        source, dest = adjustment_location, location
    else:
        source, dest = location, adjustment_location

    operation = Operation(
        reference=next_reference(db, location.warehouse_id, OperationType.adjustment),
        type=OperationType.adjustment,
        status=OperationStatus.done,
        source_location_id=source.id,
        dest_location_id=dest.id,
        scheduled_date=today(),
        responsible_user_id=user.id,
        validated_at=now(),
        reason=reason,
        note=note,
    )
    db.add(operation)
    db.flush()

    quantity = abs(diff)
    db.add(OperationLine(operation_id=operation.id, product_id=product_id, qty=quantity))
    db.add(
        StockMove(
            operation_id=operation.id,
            product_id=product_id,
            from_location_id=source.id,
            to_location_id=dest.id,
            qty=quantity,
            user_id=user.id,
        )
    )
    quant.quantity = counted_qty
    db.flush()

    return True, operation


# ---------------------------------------------------------------------------
# Operation creation and editing
# ---------------------------------------------------------------------------


def _internal_location(db: Session, location_id: int | None, field: str) -> Location:
    if location_id is None:
        raise ValidationError(
            "An internal location is required", fields={field: "Required"}
        )
    location = db.get(Location, location_id)
    if location is None:
        raise NotFoundError("Location not found")
    if not location.is_internal:
        raise ValidationError(
            "That location is not an internal location",
            fields={field: "Must be an internal location"},
        )
    return location


def resolve_locations(
    db: Session,
    op_type: OperationType,
    source_location_id: int | None,
    dest_location_id: int | None,
) -> tuple[Location, Location, int]:
    """Return (source, destination, warehouse_id) for a new or edited operation.

    The virtual side is chosen by type, never supplied by the caller. The warehouse is
    the one owning the internal side, which is what the reference is numbered against.
    """
    if op_type is OperationType.receipt:
        dest = _internal_location(db, dest_location_id, "dest_location_id")
        return virtual_location(db, LocationType.vendor), dest, dest.warehouse_id

    if op_type is OperationType.delivery:
        source = _internal_location(db, source_location_id, "source_location_id")
        return source, virtual_location(db, LocationType.customer), source.warehouse_id

    source = _internal_location(db, source_location_id, "source_location_id")
    dest = _internal_location(db, dest_location_id, "dest_location_id")
    if source.id == dest.id:
        raise ValidationError(
            "An internal transfer needs two different locations",
            fields={"dest_location_id": "Must differ from the source location"},
        )
    return source, dest, source.warehouse_id


def _validate_lines(db: Session, lines: list[LineInput]) -> None:
    product_ids = [line.product_id for line in lines]
    if len(set(product_ids)) != len(product_ids):
        raise ValidationError(
            "Each product may appear only once in an operation",
            fields={"lines": "A product is listed more than once"},
        )

    for product_id in product_ids:
        product = db.get(Product, product_id)
        if product is None:
            raise NotFoundError(f"Product {product_id} not found")
        if not product.active:
            raise ValidationError(
                f"{product.name} is archived and cannot be used",
                fields={"lines": f"Product {product_id} is not active"},
            )


def create_operation(
    db: Session,
    user: User,
    *,
    op_type: OperationType,
    scheduled_date: date,
    lines: list[LineInput],
    contact: str | None = None,
    delivery_address: str | None = None,
    source_location_id: int | None = None,
    dest_location_id: int | None = None,
) -> Operation:
    if op_type is OperationType.adjustment:
        raise ValidationError(
            "Adjustments are created through /api/stock/adjust",
            fields={"type": "Not allowed here"},
        )

    source, dest, warehouse_id = resolve_locations(
        db, op_type, source_location_id, dest_location_id
    )
    _validate_lines(db, lines)

    operation = Operation(
        reference=next_reference(db, warehouse_id, op_type),
        type=op_type,
        status=OperationStatus.draft,
        # Only the types the contract gives these fields to keep them.
        contact=contact if op_type in (OperationType.receipt, OperationType.delivery) else None,
        delivery_address=delivery_address if op_type is OperationType.delivery else None,
        source_location_id=source.id,
        dest_location_id=dest.id,
        scheduled_date=scheduled_date,
        responsible_user_id=user.id,
    )
    operation.lines = [
        OperationLine(product_id=line.product_id, qty=line.qty) for line in lines
    ]
    db.add(operation)
    db.flush()
    return operation


def update_operation(
    db: Session,
    operation_id: int,
    *,
    op_type: OperationType,
    scheduled_date: date,
    lines: list[LineInput],
    contact: str | None = None,
    delivery_address: str | None = None,
    source_location_id: int | None = None,
    dest_location_id: int | None = None,
) -> Operation:
    """Draft only. The reference is never reissued and the type cannot change."""
    operation = lock_operation(db, operation_id)
    reject_adjustment(operation)
    if operation.status is not OperationStatus.draft:
        raise InvalidStateError("Only a draft operation can be edited")
    if op_type is not operation.type:
        raise ValidationError(
            "The type of an existing operation cannot be changed",
            fields={"type": "Cannot be changed"},
        )

    source, dest, _ = resolve_locations(db, op_type, source_location_id, dest_location_id)
    _validate_lines(db, lines)

    operation.contact = (
        contact if op_type in (OperationType.receipt, OperationType.delivery) else None
    )
    operation.delivery_address = (
        delivery_address if op_type is OperationType.delivery else None
    )
    operation.source_location_id = source.id
    operation.dest_location_id = dest.id
    operation.scheduled_date = scheduled_date
    operation.lines = [
        OperationLine(product_id=line.product_id, qty=line.qty) for line in lines
    ]
    db.flush()
    return operation


# ---------------------------------------------------------------------------
# State machine. One transaction per action; the caller commits.
# ---------------------------------------------------------------------------


def lock_operation(db: Session, operation_id: int) -> Operation:
    """Lock the operation row and re-read it, so a concurrent action cannot slip past
    the status check.

    of=Operation matters: the entity has joined eager loads, and Postgres refuses
    FOR UPDATE on the nullable side of an outer join.
    """
    operation = db.scalar(
        select(Operation)
        .where(Operation.id == operation_id)
        .with_for_update(of=Operation)
        .execution_options(populate_existing=True)
    )
    if operation is None:
        raise NotFoundError("Operation not found")
    return operation


def reject_adjustment(operation: Operation) -> None:
    if operation.type is OperationType.adjustment:
        raise InvalidStateError("An adjustment cannot be changed once recorded")


def _source_pairs(operation: Operation) -> list[tuple[int, int]]:
    return [(line.product_id, operation.source_location_id) for line in operation.lines]


def _try_reserve(db: Session, operation: Operation) -> bool:
    """Reserve every line at the source, or nothing at all. Returns whether it worked."""
    quants = lock_quants(db, _source_pairs(operation))
    if any(
        quants[(line.product_id, operation.source_location_id)].free_to_use < line.qty
        for line in operation.lines
    ):
        return False
    for line in operation.lines:
        quants[(line.product_id, operation.source_location_id)].reserved += line.qty
    return True


def _release_reservations(db: Session, operation: Operation) -> None:
    quants = lock_quants(db, _source_pairs(operation))
    for line in operation.lines:
        quant = quants[(line.product_id, operation.source_location_id)]
        quant.reserved -= line.qty


def mark_todo(db: Session, operation_id: int) -> Operation:
    """draft -> ready, or waiting when the source cannot cover every line."""
    operation = lock_operation(db, operation_id)
    reject_adjustment(operation)
    if operation.status is not OperationStatus.draft:
        raise InvalidStateError("Only a draft operation can be marked to do")

    if operation.type is OperationType.receipt:
        operation.status = OperationStatus.ready
    else:
        operation.status = (
            OperationStatus.ready
            if _try_reserve(db, operation)
            else OperationStatus.waiting
        )
    db.flush()
    return operation


def check_availability(db: Session, operation_id: int) -> Operation:
    """waiting -> ready if the stock has since arrived; otherwise stays waiting."""
    operation = lock_operation(db, operation_id)
    reject_adjustment(operation)
    if operation.status is not OperationStatus.waiting:
        raise InvalidStateError("Only a waiting operation can be re-checked")

    if _try_reserve(db, operation):
        operation.status = OperationStatus.ready
    db.flush()
    return operation


def validate_operation(db: Session, user: User, operation_id: int) -> Operation:
    """ready -> done. Writes the moves and updates the cached balances."""
    operation = lock_operation(db, operation_id)
    reject_adjustment(operation)
    if operation.status is not OperationStatus.ready:
        raise InvalidStateError("Only a ready operation can be validated")

    source = operation.source_location
    dest = operation.dest_location
    pairs: list[tuple[int, int]] = []
    for line in operation.lines:
        if source.is_internal:
            pairs.append((line.product_id, source.id))
        if dest.is_internal:
            pairs.append((line.product_id, dest.id))
    quants = lock_quants(db, pairs)

    for line in operation.lines:
        if source.is_internal:
            quant = quants[(line.product_id, source.id)]
            # Defensive: reservations should already guarantee this.
            if quant.quantity < line.qty or quant.reserved < line.qty:
                raise InsufficientStockError(
                    f"{line.product.name} is no longer available at {source.full_name}"
                )
            quant.quantity -= line.qty
            quant.reserved -= line.qty
        if dest.is_internal:
            quants[(line.product_id, dest.id)].quantity += line.qty

        db.add(
            StockMove(
                operation_id=operation.id,
                product_id=line.product_id,
                from_location_id=source.id,
                to_location_id=dest.id,
                qty=line.qty,
                user_id=user.id,
            )
        )

    operation.status = OperationStatus.done
    operation.validated_at = now()
    db.flush()
    return operation


def cancel_operation(db: Session, operation_id: int) -> Operation:
    """Cancel a pending operation, giving back any reservation it was holding."""
    operation = lock_operation(db, operation_id)
    reject_adjustment(operation)
    if operation.status not in CANCELABLE_STATUSES:
        raise InvalidStateError("Only a pending operation can be canceled")

    if operation.status is OperationStatus.ready and operation.type in RESERVING_TYPES:
        _release_reservations(db, operation)

    operation.status = OperationStatus.canceled
    db.flush()
    return operation
