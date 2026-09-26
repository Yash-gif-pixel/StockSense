"""Proves SELECT ... FOR UPDATE really serialises reference allocation.

Uses the committed_seed fixture, because two genuinely concurrent transactions cannot
share the rolled-back session the other tests use.
"""

import threading
import time

from app.models import OperationType
from app.services.sequences import next_reference


def test_concurrent_reference_allocation_never_repeats(committed_seed):
    start = threading.Barrier(2)
    references: list[str] = []
    errors: list[Exception] = []

    def allocate(hold_seconds: float) -> None:
        try:
            with committed_seed.sessions() as session:
                start.wait(timeout=10)
                references.append(
                    next_reference(
                        session, committed_seed.warehouse_id, OperationType.adjustment
                    )
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
