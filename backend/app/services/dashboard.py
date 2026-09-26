"""Dashboard counters.

The product counters are built from app.services.stock.stock_expressions, the same
expression GET /api/stock uses, so the two screens can never disagree. The operation
counters reuse the operations list scoping for the same reason.
"""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.clock import today
from app.models import (
    PENDING_STATUSES,
    Operation,
    OperationStatus,
    OperationType,
    StockStatus,
)
from app.schemas.dashboard import (
    DashboardOut,
    InternalCounts,
    OperationCounts,
    ProductCounts,
)
from app.services.operations import scope_conditions
from app.services.stock import ZERO, active_products, stock_expressions

SCHEDULED_STATUSES = (OperationStatus.waiting, OperationStatus.ready)


def _operation_counts(
    db: Session, op_type: OperationType, warehouse_id: int | None, category_id: int | None
) -> OperationCounts:
    scope = scope_conditions(warehouse_id=warehouse_id, category_id=category_id)
    pending = Operation.status.in_(PENDING_STATUSES)
    current_day = today()

    row = db.execute(
        select(
            func.count().filter(Operation.status == OperationStatus.ready),
            func.count().filter(Operation.status == OperationStatus.waiting),
            func.count().filter(pending & (Operation.scheduled_date < current_day)),
            func.count().filter(pending & (Operation.scheduled_date > current_day)),
            func.count().filter(pending),
        )
        .select_from(Operation)
        .where(Operation.type == op_type, *scope)
    ).one()

    return OperationCounts(
        ready=row[0], waiting=row[1], late=row[2], upcoming=row[3], pending=row[4]
    )


def _product_counts(
    db: Session, warehouse_id: int | None, category_id: int | None
) -> ProductCounts:
    totals, on_hand, _reserved, status = stock_expressions(warehouse_id)
    # Wrapped in a subquery so the computed columns can be counted with FILTER.
    scoped = (
        active_products(totals, category_id=category_id)
        .add_columns(on_hand.label("on_hand"), status.label("status"))
        .subquery()
    )
    row = db.execute(
        select(
            # in_stock is counted from on_hand directly rather than derived from the
            # status buckets, so the test comparing it against GET /api/stock is a real
            # cross-check and not a tautology.
            func.count().filter(scoped.c.on_hand > ZERO),
            func.count().filter(scoped.c.status == StockStatus.low.value),
            func.count().filter(scoped.c.status == StockStatus.out.value),
        ).select_from(scoped)
    ).one()
    return ProductCounts(in_stock=row[0], low_stock=row[1], out_of_stock=row[2])


def build_dashboard(
    db: Session, warehouse_id: int | None = None, category_id: int | None = None
) -> DashboardOut:
    scope = scope_conditions(warehouse_id=warehouse_id, category_id=category_id)
    scheduled = (
        db.scalar(
            select(func.count())
            .select_from(Operation)
            .where(
                Operation.type == OperationType.internal,
                Operation.status.in_(SCHEDULED_STATUSES),
                *scope,
            )
        )
        or 0
    )

    return DashboardOut(
        receipts=_operation_counts(db, OperationType.receipt, warehouse_id, category_id),
        deliveries=_operation_counts(
            db, OperationType.delivery, warehouse_id, category_id
        ),
        internal=InternalCounts(scheduled=scheduled),
        products=_product_counts(db, warehouse_id, category_id),
    )
