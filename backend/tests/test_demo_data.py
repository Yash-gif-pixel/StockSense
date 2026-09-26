"""The demo dataset must be realistic AND internally consistent."""

from decimal import Decimal

from sqlalchemy import func, select

from app.models import Operation, OperationStatus, OperationType, Product, StockQuant  # noqa: F401
from app.services import dashboard as dashboard_service
from scripts import check_ledger, demo_data


def test_demo_data_builds_a_consistent_ledger(api, db):
    references = demo_data.build(db)
    db.flush()

    assert references, "nothing was created"
    assert len(references) == len(set(references)), "a reference was handed out twice"

    problems = check_ledger.check(db)
    assert problems == [], problems


def test_demo_data_covers_every_status_and_type(db):
    demo_data.build(db)
    db.flush()

    statuses = {
        (op.type, op.status)
        for op in db.scalars(select(Operation)).unique()
    }
    receipt_statuses = {s for t, s in statuses if t is OperationType.receipt}
    delivery_statuses = {s for t, s in statuses if t is OperationType.delivery}
    internal_statuses = {s for t, s in statuses if t is OperationType.internal}

    assert receipt_statuses >= {
        OperationStatus.draft,
        OperationStatus.ready,
        OperationStatus.done,
        OperationStatus.canceled,
    }
    assert delivery_statuses >= {
        OperationStatus.draft,
        OperationStatus.waiting,
        OperationStatus.ready,
        OperationStatus.done,
        OperationStatus.canceled,
    }
    assert internal_statuses == {OperationStatus.ready, OperationStatus.done}

    reasons = set(
        db.scalars(
            select(Operation.reason).where(Operation.type == OperationType.adjustment)
        )
    )
    assert {"count", "damaged", "lost"} <= reasons


def test_demo_dashboard_has_something_in_every_interesting_counter(db):
    demo_data.build(db)
    db.flush()

    summary = dashboard_service.build_dashboard(db)

    assert summary.receipts.late > 0, "no late receipt"
    assert summary.deliveries.late > 0, "no late delivery"
    assert summary.deliveries.waiting > 0, "no genuinely short delivery"
    assert summary.receipts.upcoming > 0
    assert summary.deliveries.ready > 0
    assert summary.internal.scheduled > 0
    assert summary.products.low_stock > 0, "no low-stock product"
    assert summary.products.out_of_stock > 0, "no out-of-stock product"
    assert summary.products.in_stock > 0


def test_demo_data_spreads_stock_across_both_locations(db, seed_data):
    demo_data.build(db)
    db.flush()

    locations_with_stock = set(
        db.scalars(
            select(StockQuant.location_id).where(StockQuant.quantity > Decimal("0"))
        )
    )
    assert {seed_data.stock1.id, seed_data.stock2.id} <= locations_with_stock
    assert db.scalar(select(func.count()).select_from(Product)) >= 8


def test_demo_data_refuses_to_run_twice(db):
    assert demo_data._already_populated(db) is False

    demo_data.build(db)
    db.flush()

    assert demo_data._already_populated(db) is True


# --- chronology -----------------------------------------------------------

EXPECTED_DASHBOARD = {
    "receipts": {"ready": 1, "waiting": 0, "late": 1, "upcoming": 1, "pending": 3},
    "deliveries": {"ready": 1, "waiting": 1, "late": 1, "upcoming": 2, "pending": 4},
    "internal": {"scheduled": 1},
    "products": {"in_stock": 6, "low_stock": 2, "out_of_stock": 2},
}


def test_moves_are_spread_over_at_least_seven_days(db):
    from app.core.clock import local_date
    from app.models import StockMove

    demo_data.build(db)
    db.flush()

    created = list(db.scalars(select(StockMove.created_at)))
    days = {local_date(stamp) for stamp in created}

    assert len(created) == len(set(created)), "two moves share an instant"
    assert len(days) >= 7, f"only {len(days)} distinct days: {sorted(days)}"


def test_ids_ascend_with_time_for_operations_and_moves(db):
    from app.models import StockMove

    demo_data.build(db)
    db.flush()

    for column_id, column_at in (
        (Operation.id, Operation.created_at),
        (StockMove.id, StockMove.created_at),
    ):
        rows = db.execute(select(column_id, column_at).order_by(column_id)).all()
        stamps = [stamp for _id, stamp in rows]
        assert stamps == sorted(stamps), f"{column_at} does not ascend with id"


def test_every_validated_document_was_created_first(db):
    demo_data.build(db)
    db.flush()

    validated = db.scalars(
        select(Operation).where(Operation.validated_at.is_not(None))
    ).unique()
    for operation in validated:
        assert operation.created_at <= operation.validated_at, operation.reference


def test_the_ledger_is_never_updated_only_inserted(db):
    """Back-dating must happen at INSERT time; an UPDATE would break insert-only."""
    import re

    from sqlalchemy import event

    from app.core.db import engine

    statements: list[str] = []

    def record(conn, cursor, statement, parameters, context, executemany):
        statements.append(statement)

    event.listen(engine, "before_cursor_execute", record)
    try:
        demo_data.build(db)
        db.flush()
    finally:
        event.remove(engine, "before_cursor_execute", record)

    inserts = [s for s in statements if re.search(r"insert\s+into\s+stock_moves", s, re.I)]
    updates = [s for s in statements if re.search(r"update\s+stock_moves", s, re.I)]
    deletes = [s for s in statements if re.search(r"delete\s+from\s+stock_moves", s, re.I)]

    assert inserts, "the listener captured nothing, so this test proves nothing"
    assert updates == [], updates
    assert deletes == [], deletes


def test_dashboard_numbers_match_the_documented_demo_scenario(db):
    demo_data.build(db)
    db.flush()

    summary = dashboard_service.build_dashboard(db)

    assert summary.model_dump() == EXPECTED_DASHBOARD
