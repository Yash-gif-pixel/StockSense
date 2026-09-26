"""Genuine two-connection concurrency against the state machine.

These need committed rows, so they use the committed_seed fixture rather than the
rolled-back session the rest of the suite shares.
"""

import threading
import time
from decimal import Decimal

from sqlalchemy import select

from app.core.clock import today
from app.models import Operation, OperationStatus, OperationType, StockQuant, User
from app.services import inventory


#: Delay injected inside lock_quant, AFTER it acquires the row, so both transactions
#: are provably inside their critical section at once. Holding only after the service
#: call is not enough: the work finishes in under a millisecond and one thread simply
#: reads the other's committed result, which proves nothing about locking.
HOLD_SECONDS = 0.5


def slow_lock_quant(monkeypatch, delay=HOLD_SECONDS, before=False):
    """Stretch lock_quant so concurrent callers really overlap."""
    real = inventory.lock_quant

    def patched(session, product_id, location_id):
        if before:
            time.sleep(delay)
            return real(session, product_id, location_id)
        quant = real(session, product_id, location_id)
        time.sleep(delay)
        return quant

    monkeypatch.setattr(inventory, "lock_quant", patched)


def _run_together(work, count=2, timeout=30):
    """Start `count` threads at the same instant and collect (result, error) pairs."""
    start = threading.Barrier(count)
    results: list[object] = []
    errors: list[Exception] = []

    def wrapped(index):
        try:
            start.wait(timeout=10)
            results.append(work(index))
        except Exception as exc:  # noqa: BLE001 - asserted by the caller
            errors.append(exc)

    threads = [threading.Thread(target=wrapped, args=(i,)) for i in range(count)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=timeout)
    assert not any(thread.is_alive() for thread in threads), "a thread never finished"
    return results, errors


def _delivery(session, data, product_id, qty):
    user = session.get(User, data.user_id)
    return inventory.create_operation(
        session,
        user,
        op_type=OperationType.delivery,
        scheduled_date=today(),
        lines=[inventory.LineInput(product_id=product_id, qty=Decimal(qty))],
        source_location_id=data.stock1_id,
    )


def test_two_deliveries_racing_for_the_last_units_give_one_ready_one_waiting(
    committed_seed, monkeypatch
):
    """Both transactions read availability at the same instant; only the row lock stops
    them both concluding the stock is free."""
    data = committed_seed
    with data.sessions() as setup:
        user = setup.get(User, data.user_id)
        inventory.adjust(
            setup,
            user,
            product_id=data.desk_id,
            location_id=data.stock1_id,
            counted_qty=Decimal("10"),
            reason="count",
        )
        first = _delivery(setup, data, data.desk_id, 10).id
        second = _delivery(setup, data, data.desk_id, 10).id
        setup.commit()

    operation_ids = [first, second]
    slow_lock_quant(monkeypatch)

    def mark_todo(index):
        with data.sessions() as session:
            operation = inventory.mark_todo(session, operation_ids[index])
            status = operation.status
            session.commit()
            return status

    results, errors = _run_together(mark_todo)

    assert not errors, errors
    assert sorted(status.value for status in results) == ["ready", "waiting"], (
        "the source quant lock did not serialise the two reservations"
    )

    with data.sessions() as check:
        quant = check.get(StockQuant, (data.desk_id, data.stock1_id))
        assert quant.quantity == Decimal("10.000")
        assert quant.reserved == Decimal("10.000"), "only one delivery may hold the stock"


def test_two_multi_line_operations_in_opposite_order_validate_without_deadlock(
    committed_seed, monkeypatch
):
    """lock_quants sorts by (product_id, location_id), so line order cannot deadlock.

    lock_quant is slowed down so the two transactions interleave their acquisitions.
    Unsorted, that is the classic ABBA deadlock; sorted, they simply queue.
    """
    data = committed_seed
    products = [data.desk_id, data.table_id]

    with data.sessions() as setup:
        user = setup.get(User, data.user_id)
        for product_id in products:
            inventory.adjust(
                setup,
                user,
                product_id=product_id,
                location_id=data.stock1_id,
                counted_qty=Decimal("100"),
                reason="count",
            )

        operation_ids = []
        # The two documents list the same products in opposite order.
        for ordering in (products, list(reversed(products))):
            operation = inventory.create_operation(
                setup,
                user,
                op_type=OperationType.internal,
                scheduled_date=today(),
                lines=[
                    inventory.LineInput(product_id=product_id, qty=Decimal("10"))
                    for product_id in ordering
                ],
                source_location_id=data.stock1_id,
                dest_location_id=data.stock2_id,
            )
            inventory.mark_todo(setup, operation.id)
            operation_ids.append(operation.id)
        setup.commit()

        assert [
            setup.get(Operation, oid).status for oid in operation_ids
        ] == [OperationStatus.ready, OperationStatus.ready]

    # Delay BEFORE acquiring, so the two documents interleave their acquisitions.
    slow_lock_quant(monkeypatch, delay=0.25, before=True)

    def validate(index):
        with data.sessions() as session:
            user = session.get(User, data.user_id)
            operation = inventory.validate_operation(session, user, operation_ids[index])
            status = operation.status
            session.commit()
            return status

    results, errors = _run_together(validate)

    assert not errors, f"concurrent validate failed (deadlock?): {errors}"
    assert [status.value for status in results] == ["done", "done"]

    with data.sessions() as check:
        for product_id in products:
            source = check.get(StockQuant, (product_id, data.stock1_id))
            dest = check.get(StockQuant, (product_id, data.stock2_id))
            assert source.quantity == Decimal("80.000")
            assert source.reserved == Decimal("0.000")
            assert dest.quantity == Decimal("20.000")

        statuses = check.scalars(
            select(Operation.status).where(Operation.id.in_(operation_ids))
        ).all()
        assert set(statuses) == {OperationStatus.done}
