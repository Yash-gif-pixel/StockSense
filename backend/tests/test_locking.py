"""Proves SELECT ... FOR UPDATE really serialises reference allocation.

This is the one test that cannot use the usual rolled-back session: it needs two
committed, genuinely concurrent transactions on separate connections. It therefore
commits, and truncates everything on the way in and out.
"""

import threading
import time

import pytest
from sqlalchemy import select, text

from app.core.db import SessionLocal, engine
from app.models import Base, OperationType, Warehouse
from app.services.sequences import next_reference
from scripts.seed import seed

TABLES = [t.name for t in Base.metadata.sorted_tables]


def _truncate() -> None:
    with engine.begin() as conn:
        conn.execute(text(f"TRUNCATE {', '.join(TABLES)} RESTART IDENTITY CASCADE"))


@pytest.fixture
def committed_seed(migrated_database):
    _truncate()
    with SessionLocal() as setup:
        seed(setup)
        setup.commit()
        warehouse_id = setup.scalar(select(Warehouse.id).where(Warehouse.short_code == "WH"))
    yield warehouse_id
    _truncate()


def test_concurrent_reference_allocation_never_repeats(committed_seed):
    warehouse_id = committed_seed
    start = threading.Barrier(2)
    references: list[str] = []
    errors: list[Exception] = []

    def allocate(hold_seconds: float) -> None:
        try:
            with SessionLocal() as session:
                start.wait(timeout=10)
                references.append(
                    next_reference(session, warehouse_id, OperationType.adjustment)
                )
                # Keep the lock held so the other thread has to wait for it.
                time.sleep(hold_seconds)
                session.commit()
        except Exception as exc:  # noqa: BLE001 - reported below
            errors.append(exc)

    threads = [
        threading.Thread(target=allocate, args=(0.4,)),
        threading.Thread(target=allocate, args=(0.0,)),
    ]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=20)

    assert not errors, errors
    assert sorted(references) == ["WH/ADJ/0001", "WH/ADJ/0002"], (
        "both transactions read the same next_value, so the row was not locked"
    )
