"""occurred_at back-dates ledger rows for the demo script, and must stay off the API."""

from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.core.clock import local_date, today
from app.models import Operation, StockMove, User
from app.services import inventory

BACKDATED = datetime(2026, 9, 12, 10, 30, tzinfo=timezone.utc)


def demo_user(db) -> User:
    return db.scalar(select(User).where(User.login_id == "demo_user"))


def test_adjust_stamps_the_supplied_instant(db, seed_data):
    changed, operation = inventory.adjust(
        db,
        demo_user(db),
        product_id=seed_data.desk.id,
        location_id=seed_data.stock1.id,
        counted_qty=Decimal("10"),
        reason="count",
        occurred_at=BACKDATED,
    )
    db.flush()

    assert changed
    assert operation.created_at == BACKDATED
    assert operation.validated_at == BACKDATED
    # An adjustment is counted and posted at once, so its scheduled date follows suit.
    assert operation.scheduled_date == local_date(BACKDATED)

    move = db.scalar(select(StockMove).where(StockMove.operation_id == operation.id))
    assert move.created_at == BACKDATED


def test_create_and_validate_stamp_the_supplied_instants(db, seed_data):
    created_at = BACKDATED
    validated_at = BACKDATED + timedelta(hours=4)
    user = demo_user(db)

    operation = inventory.create_operation(
        db,
        user,
        op_type=inventory.OperationType.receipt,
        scheduled_date=today(),
        lines=[inventory.LineInput(product_id=seed_data.desk.id, qty=Decimal("7"))],
        dest_location_id=seed_data.stock1.id,
        occurred_at=created_at,
    )
    db.flush()
    assert operation.created_at == created_at

    inventory.mark_todo(db, operation.id)
    inventory.validate_operation(db, user, operation.id, occurred_at=validated_at)
    db.flush()

    assert operation.validated_at == validated_at
    assert operation.created_at == created_at
    assert operation.created_at < operation.validated_at

    move = db.scalar(select(StockMove).where(StockMove.operation_id == operation.id))
    assert move.created_at == validated_at


def test_omitting_occurred_at_keeps_the_old_behaviour(db, seed_data):
    before = datetime.now(timezone.utc)
    _changed, operation = inventory.adjust(
        db,
        demo_user(db),
        product_id=seed_data.desk.id,
        location_id=seed_data.stock1.id,
        counted_qty=Decimal("3"),
        reason="count",
    )
    db.flush()
    after = datetime.now(timezone.utc)

    assert before <= operation.created_at <= after
    assert before <= operation.validated_at <= after
    assert operation.scheduled_date == today()


@pytest.mark.parametrize("naive", [datetime(2026, 9, 12, 10, 30), datetime(2026, 1, 1)])
def test_a_naive_occurred_at_is_refused(db, seed_data, naive):
    with pytest.raises(ValueError, match="timezone-aware"):
        inventory.adjust(
            db,
            demo_user(db),
            product_id=seed_data.desk.id,
            location_id=seed_data.stock1.id,
            counted_qty=Decimal("10"),
            reason="count",
            occurred_at=naive,
        )


def test_naive_occurred_at_is_refused_on_create_and_validate(db, seed_data):
    user = demo_user(db)
    with pytest.raises(ValueError, match="timezone-aware"):
        inventory.create_operation(
            db,
            user,
            op_type=inventory.OperationType.receipt,
            scheduled_date=today(),
            lines=[inventory.LineInput(product_id=seed_data.desk.id, qty=Decimal("1"))],
            dest_location_id=seed_data.stock1.id,
            occurred_at=datetime(2026, 9, 12, 10, 30),
        )


# --- the API must never let a client set it -------------------------------


def test_the_adjust_endpoint_ignores_occurred_at(api, db, seed_data):
    before = datetime.now(timezone.utc)

    response = api.post(
        "/api/stock/adjust",
        json={
            "product_id": seed_data.desk.id,
            "location_id": seed_data.stock1.id,
            "counted_qty": 10,
            "reason": "count",
            "occurred_at": "2001-01-01T00:00:00Z",
        },
    )

    assert response.status_code == 200, response.text
    operation = response.json()["operation"]
    assert not operation["created_at"].startswith("2001")
    assert datetime.fromisoformat(operation["created_at"]) >= before


def test_the_operations_endpoint_ignores_occurred_at(api, seed_data):
    before = datetime.now(timezone.utc)

    response = api.post(
        "/api/operations",
        json={
            "type": "receipt",
            "contact": "Tata Steel",
            "dest_location_id": seed_data.stock1.id,
            "scheduled_date": today().isoformat(),
            "lines": [{"product_id": seed_data.desk.id, "qty": 5}],
            "occurred_at": "2001-01-01T00:00:00Z",
        },
    )

    assert response.status_code == 201, response.text
    body = response.json()
    assert not body["created_at"].startswith("2001")
    assert datetime.fromisoformat(body["created_at"]) >= before
    assert "occurred_at" not in body


def test_occurred_at_is_absent_from_the_public_schemas():
    """Unknown keys are ignored (pydantic's default extra='ignore'), so the guarantee is
    that the field simply does not exist on any request model."""
    from app.schemas.operation import OperationIn, OperationLineIn
    from app.schemas.stock import AdjustRequest

    for model in (OperationIn, OperationLineIn, AdjustRequest):
        assert "occurred_at" not in model.model_fields, model.__name__

    parsed = AdjustRequest(
        product_id=1,
        location_id=1,
        counted_qty=1,
        reason="count",
        occurred_at="2001-01-01T00:00:00Z",
    )
    assert not hasattr(parsed, "occurred_at")
    assert "occurred_at" not in parsed.model_dump()


def test_no_router_mentions_occurred_at():
    """A router passing it through would be the only way to reach it from outside."""
    import pathlib

    root = pathlib.Path(__file__).resolve().parents[1] / "app"
    offenders = [
        path.relative_to(root).as_posix()
        for folder in ("api", "schemas")
        for path in (root / folder).rglob("*.py")
        if "occurred_at" in path.read_text()
    ]
    assert offenders == []


def test_the_validate_endpoint_stamps_now_not_a_client_value(api, seed_data):
    created = api.post(
        "/api/operations",
        json={
            "type": "receipt",
            "dest_location_id": seed_data.stock1.id,
            "scheduled_date": today().isoformat(),
            "lines": [{"product_id": seed_data.desk.id, "qty": 2}],
        },
    ).json()
    api.post(f"/api/operations/{created['id']}/todo")

    before = datetime.now(timezone.utc)
    validated = api.post(
        f"/api/operations/{created['id']}/validate",
        json={"occurred_at": "2001-01-01T00:00:00Z"},
    )

    assert validated.status_code == 200
    assert datetime.fromisoformat(validated.json()["validated_at"]) >= before
