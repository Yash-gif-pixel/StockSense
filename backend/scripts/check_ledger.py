"""Ledger integrity check.

stock_moves is the source of truth; stock_quants is a cached balance. If they ever
disagree, something wrote stock outside app/services/inventory.py.

    uv run python -m scripts.check_ledger      # exit 0 = OK, 1 = mismatches

Checks, for every internal (product, location):
  1. sum of moves in - sum of moves out == quant.quantity
  2. reserved == the summed qty of ready delivery/internal lines leaving that location
  3. no quant is negative
"""

import sys
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import SessionLocal
from app.models import (
    Location,
    LocationType,
    Operation,
    OperationStatus,
    OperationType,
    StockMove,
    StockQuant,
)

ZERO = Decimal("0")
RESERVING_TYPES = (OperationType.delivery, OperationType.internal)


def _internal_location_ids(db: Session) -> set[int]:
    return set(
        db.scalars(select(Location.id).where(Location.type == LocationType.internal))
    )


def _balances_from_moves(db: Session, internal_ids: set[int]) -> dict[tuple[int, int], Decimal]:
    balances: dict[tuple[int, int], Decimal] = {}
    for move in db.scalars(select(StockMove)):
        if move.to_location_id in internal_ids:
            key = (move.product_id, move.to_location_id)
            balances[key] = balances.get(key, ZERO) + move.qty
        if move.from_location_id in internal_ids:
            key = (move.product_id, move.from_location_id)
            balances[key] = balances.get(key, ZERO) - move.qty
    return balances


def _expected_reservations(db: Session) -> dict[tuple[int, int], Decimal]:
    expected: dict[tuple[int, int], Decimal] = {}
    operations = db.scalars(
        select(Operation).where(
            Operation.status == OperationStatus.ready,
            Operation.type.in_(RESERVING_TYPES),
        )
    ).unique()
    for operation in operations:
        for line in operation.lines:
            key = (line.product_id, operation.source_location_id)
            expected[key] = expected.get(key, ZERO) + line.qty
    return expected


def check(db: Session) -> list[str]:
    """Return a list of human-readable problems; empty means the ledger is consistent."""
    problems: list[str] = []
    internal_ids = _internal_location_ids(db)

    quants = {
        (quant.product_id, quant.location_id): quant
        for quant in db.scalars(select(StockQuant))
        if quant.location_id in internal_ids
    }
    balances = _balances_from_moves(db, internal_ids)
    expected_reservations = _expected_reservations(db)

    for key in sorted(set(quants) | set(balances)):
        product_id, location_id = key
        quantity = quants[key].quantity if key in quants else ZERO
        from_moves = balances.get(key, ZERO)
        if quantity != from_moves:
            problems.append(
                f"product {product_id} at location {location_id}: "
                f"quant quantity {quantity} but moves net to {from_moves}"
            )

    for key in sorted(set(quants) | set(expected_reservations)):
        product_id, location_id = key
        reserved = quants[key].reserved if key in quants else ZERO
        expected = expected_reservations.get(key, ZERO)
        if reserved != expected:
            problems.append(
                f"product {product_id} at location {location_id}: "
                f"reserved {reserved} but ready outgoing lines total {expected}"
            )

    for key, quant in sorted(quants.items()):
        if quant.quantity < ZERO:
            problems.append(f"product {key[0]} at location {key[1]}: negative quantity {quant.quantity}")
        if quant.reserved < ZERO:
            problems.append(f"product {key[0]} at location {key[1]}: negative reserved {quant.reserved}")

    return problems


def main() -> int:
    with SessionLocal() as db:
        problems = check(db)
    if problems:
        print(f"ledger FAILED: {len(problems)} problem(s)")
        for problem in problems:
            print(f"  - {problem}")
        return 1
    print("ledger OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
