"""The stock ledger. This is the ONLY module allowed to write stock_quants or stock_moves.

Transactions: every function here does its work inside the caller's transaction and
never commits. The caller owns the commit, so that e.g. creating a product and booking
its initial stock land atomically. Callers must commit or the work is discarded.

Locking: quant rows are always locked in (product_id, location_id) order so concurrent
operations touching overlapping products cannot deadlock.
"""

from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.core.clock import now, today
from app.core.errors import ConflictError, NotFoundError, ValidationError
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


def get_adjustment_location(db: Session) -> Location:
    location = db.scalar(
        select(Location)
        .where(Location.type == LocationType.adjustment)
        .order_by(Location.id)
        .limit(1)
    )
    if location is None:
        raise ConflictError("No Inventory Adjustment location exists; run the seed")
    return location


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
