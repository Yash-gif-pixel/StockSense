"""Stock read models. Filtering, status and pagination are all computed in SQL.

Read-only: nothing here writes quants or moves (that is inventory.py's job).
"""

from decimal import Decimal

from sqlalchemy import Select, and_, case, func, literal, or_, select
from sqlalchemy.orm import Session

from app.models import Location, LocationType, Product, StockQuant, StockStatus
from app.schemas.common import Pagination
from app.schemas.stock import StockLocationRowOut, StockRowOut

ZERO = Decimal("0")


def internal_totals(warehouse_id: int | None):
    """Per-product on-hand and reserved, counting internal locations only."""
    query = (
        select(
            StockQuant.product_id.label("product_id"),
            func.sum(StockQuant.quantity).label("on_hand"),
            func.sum(StockQuant.reserved).label("reserved"),
        )
        .join(Location, Location.id == StockQuant.location_id)
        .where(Location.type == LocationType.internal)
        .group_by(StockQuant.product_id)
    )
    if warehouse_id is not None:
        query = query.where(Location.warehouse_id == warehouse_id)
    return query.subquery()


def _count(db: Session, query: Select) -> int:
    return db.scalar(select(func.count()).select_from(query.subquery())) or 0


def stock_expressions(warehouse_id: int | None):
    """The single definition of on_hand, reserved and status.

    GET /api/stock and GET /api/dashboard both build on this, so their numbers cannot
    disagree. status: out if on_hand <= 0; low if min_qty is set and on_hand <= min_qty;
    otherwise ok.
    """
    totals = internal_totals(warehouse_id)
    on_hand = func.coalesce(totals.c.on_hand, literal(ZERO))
    reserved = func.coalesce(totals.c.reserved, literal(ZERO))
    status = case(
        (on_hand <= ZERO, StockStatus.out.value),
        (
            and_(Product.min_qty.is_not(None), on_hand <= Product.min_qty),
            StockStatus.low.value,
        ),
        else_=StockStatus.ok.value,
    )
    return totals, on_hand, reserved, status


def active_products(totals, category_id: int | None = None, search: str | None = None):
    """Active products left-joined to their internal totals, with the shared filters."""
    query = (
        select(Product)
        .outerjoin(totals, totals.c.product_id == Product.id)
        .where(Product.active.is_(True))
    )
    if search:
        pattern = f"%{search}%"
        query = query.where(or_(Product.name.ilike(pattern), Product.sku.ilike(pattern)))
    if category_id is not None:
        query = query.where(Product.category_id == category_id)
    return query


def stock_rows(
    db: Session,
    pagination: Pagination,
    search: str | None = None,
    warehouse_id: int | None = None,
    category_id: int | None = None,
    status: StockStatus | None = None,
) -> tuple[list[StockRowOut], int]:
    totals, on_hand, reserved, status_expr = stock_expressions(warehouse_id)

    query = active_products(totals, category_id=category_id, search=search).add_columns(
        on_hand.label("on_hand"), reserved.label("reserved"), status_expr
    )
    if status is not None:
        # Repeating the expression, because Postgres cannot filter on a select alias.
        query = query.where(status_expr == status.value)

    total = _count(db, query)
    rows = db.execute(
        query.order_by(Product.name, Product.id)
        .limit(pagination.limit)
        .offset(pagination.offset)
    ).all()

    items = [
        StockRowOut(
            product=product,
            on_hand=quantity,
            reserved=reserved_qty,
            free_to_use=quantity - reserved_qty,
            status=StockStatus(row_status),
        )
        for product, quantity, reserved_qty, row_status in rows
    ]
    return items, total


def product_location_rows(
    db: Session, product_id: int, pagination: Pagination
) -> tuple[list[StockLocationRowOut], int]:
    """Every internal location that holds a quant row for this product."""
    query = (
        select(Location, StockQuant.quantity, StockQuant.reserved)
        .join(StockQuant, StockQuant.location_id == Location.id)
        .where(StockQuant.product_id == product_id, Location.type == LocationType.internal)
    )
    total = _count(db, query)
    rows = db.execute(
        query.order_by(Location.id).limit(pagination.limit).offset(pagination.offset)
    ).all()

    items = [
        StockLocationRowOut(
            location=location,
            on_hand=quantity,
            reserved=reserved,
            free_to_use=quantity - reserved,
        )
        for location, quantity, reserved in rows
    ]
    return items, total
