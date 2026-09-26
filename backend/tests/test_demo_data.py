"""The demo dataset must be realistic AND internally consistent."""

from decimal import Decimal

from sqlalchemy import func, select

from app.models import Operation, OperationStatus, OperationType, Product, StockQuant
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
