"""Move history reads. Read-only: inventory.py is the only writer of stock_moves."""

from datetime import date

from sqlalchemy import Select, and_, case, func, or_, select
from sqlalchemy.orm import Session, aliased

from app.core.clock import day_after, day_start
from app.core.errors import ValidationError
from app.models import Location, LocationType, MoveDirection, Operation, Product, StockMove
from app.schemas.common import Pagination


def _direction_expression(source: type[Location], dest: type[Location]):
    """The contract's rule, in SQL: in = virtual -> internal, out = internal -> virtual,
    internal = internal -> internal. Mirrors StockMove.direction.
    """
    return case(
        (
            and_(
                source.type == LocationType.internal,
                dest.type == LocationType.internal,
            ),
            MoveDirection.internal.value,
        ),
        (source.type == LocationType.internal, MoveDirection.out.value),
        else_=MoveDirection.in_.value,
    )


def list_moves(
    db: Session,
    pagination: Pagination,
    search: str | None = None,
    product_id: int | None = None,
    location_id: int | None = None,
    direction: MoveDirection | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> tuple[list[StockMove], int]:
    if date_from is not None and date_to is not None and date_from > date_to:
        raise ValidationError(
            "date_from cannot be after date_to",
            fields={"date_from": "Must be on or before date_to"},
        )

    source = aliased(Location)
    dest = aliased(Location)
    operation = aliased(Operation)
    product = aliased(Product)

    conditions = []
    if product_id is not None:
        conditions.append(StockMove.product_id == product_id)
    if location_id is not None:
        conditions.append(
            or_(
                StockMove.from_location_id == location_id,
                StockMove.to_location_id == location_id,
            )
        )
    if direction is not None:
        conditions.append(_direction_expression(source, dest) == direction.value)
    if date_from is not None:
        # Whole days in APP_TIMEZONE, inclusive of both ends.
        conditions.append(StockMove.created_at >= day_start(date_from))
    if date_to is not None:
        conditions.append(StockMove.created_at < day_after(date_to))
    if search:
        pattern = f"%{search}%"
        conditions.append(
            or_(
                operation.reference.ilike(pattern),
                operation.contact.ilike(pattern),
                product.sku.ilike(pattern),
                product.name.ilike(pattern),
            )
        )

    def apply(stmt: Select) -> Select:
        stmt = stmt.join(source, source.id == StockMove.from_location_id).join(
            dest, dest.id == StockMove.to_location_id
        )
        if search:
            stmt = stmt.join(operation, operation.id == StockMove.operation_id).join(
                product, product.id == StockMove.product_id
            )
        return stmt.where(*conditions)

    total = db.scalar(apply(select(func.count(StockMove.id)))) or 0
    moves = (
        db.scalars(
            apply(select(StockMove))
            .order_by(StockMove.created_at.desc(), StockMove.id.desc())
            .limit(pagination.limit)
            .offset(pagination.offset)
        )
        .unique()
        .all()
    )
    return list(moves), total
