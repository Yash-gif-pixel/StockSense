"""Stock reads and the adjustment path through inventory.py."""

from decimal import Decimal

from sqlalchemy import func, select

from app.models import (
    Location,
    LocationType,
    Operation,
    OperationStatus,
    OperationType,
    ReferenceSequence,
    StockMove,
    StockQuant,
)


def adjust(api, product_id, location_id, counted_qty, reason="count", note=None):
    payload = {
        "product_id": product_id,
        "location_id": location_id,
        "counted_qty": counted_qty,
        "reason": reason,
    }
    if note is not None:
        payload["note"] = note
    return api.post("/api/stock/adjust", json=payload)


def quantity(db, product_id, location_id) -> Decimal:
    db.expire_all()
    quant = db.get(StockQuant, (product_id, location_id))
    return Decimal("0") if quant is None else quant.quantity


def test_adjust_gain_writes_one_operation_line_and_move(api, db, seed_data):
    response = adjust(api, seed_data.desk.id, seed_data.stock1.id, 100, note="found some")

    assert response.status_code == 200
    body = response.json()
    assert body["changed"] is True

    operation = body["operation"]
    assert operation["reference"] == "WH/ADJ/0001"
    assert operation["type"] == "adjustment"
    assert operation["status"] == "done"
    assert operation["source_location"]["full_name"] == "Inventory Adjustment"
    assert operation["dest_location"]["full_name"] == "WH/Stock1"
    assert operation["contact"] is None
    assert operation["delivery_address"] is None
    assert operation["is_late"] is False
    assert operation["validated_at"] is not None
    assert operation["responsible"]["login_id"] == "test_user"
    assert set(operation["responsible"]) == {"id", "login_id"}

    assert len(operation["lines"]) == 1
    line = operation["lines"][0]
    assert line["qty"] == 100, "quantities are JSON numbers"
    assert line["product"]["sku"] == "DESK001"
    assert line["free_to_use_at_source"] is None
    assert line["is_short"] is False

    assert quantity(db, seed_data.desk.id, seed_data.stock1.id) == Decimal("100.000")


def test_adjust_loss_moves_stock_out_to_the_adjustment_location(api, db, seed_data):
    adjust(api, seed_data.desk.id, seed_data.stock1.id, 100)
    response = adjust(api, seed_data.desk.id, seed_data.stock1.id, 77, reason="damaged")

    assert response.status_code == 200
    operation = response.json()["operation"]
    assert operation["reference"] == "WH/ADJ/0002"
    assert operation["source_location"]["full_name"] == "WH/Stock1"
    assert operation["dest_location"]["full_name"] == "Inventory Adjustment"
    assert operation["lines"][0]["qty"] == 23

    db.expire_all()
    stored = db.scalar(select(Operation).where(Operation.reference == "WH/ADJ/0002"))
    assert stored.reason == "damaged"
    assert quantity(db, seed_data.desk.id, seed_data.stock1.id) == Decimal("77.000")


def test_adjust_to_the_same_quantity_writes_nothing(api, db, seed_data):
    adjust(api, seed_data.desk.id, seed_data.stock1.id, 50)
    db.expire_all()
    sequence_before = db.get(
        ReferenceSequence, (seed_data.warehouse.id, OperationType.adjustment.value)
    ).next_value

    response = adjust(api, seed_data.desk.id, seed_data.stock1.id, 50)

    assert response.status_code == 200
    assert response.json() == {"changed": False, "operation": None}

    db.expire_all()
    assert db.scalar(select(func.count()).select_from(Operation)) == 1
    assert db.scalar(select(func.count()).select_from(StockMove)) == 1
    sequence_after = db.get(
        ReferenceSequence, (seed_data.warehouse.id, OperationType.adjustment.value)
    ).next_value
    assert sequence_after == sequence_before, "a no-op must not consume a reference"


def test_adjust_below_the_reserved_quantity_conflicts(api, db, seed_data):
    adjust(api, seed_data.desk.id, seed_data.stock1.id, 100)

    db.expire_all()
    quant = db.get(StockQuant, (seed_data.desk.id, seed_data.stock1.id))
    quant.reserved = Decimal("50.000")
    db.flush()

    response = adjust(api, seed_data.desk.id, seed_data.stock1.id, 40)

    assert response.status_code == 409
    body = response.json()
    assert body["code"] == "conflict"
    assert "counted_qty" in body["fields"]
    assert quantity(db, seed_data.desk.id, seed_data.stock1.id) == Decimal("100.000")


def test_adjust_down_to_exactly_the_reserved_quantity_is_allowed(api, db, seed_data):
    adjust(api, seed_data.desk.id, seed_data.stock1.id, 100)
    db.expire_all()
    quant = db.get(StockQuant, (seed_data.desk.id, seed_data.stock1.id))
    quant.reserved = Decimal("50.000")
    db.flush()

    response = adjust(api, seed_data.desk.id, seed_data.stock1.id, 50)

    assert response.status_code == 200
    assert quantity(db, seed_data.desk.id, seed_data.stock1.id) == Decimal("50.000")


def test_adjust_rejects_a_negative_count(api, seed_data):
    response = adjust(api, seed_data.desk.id, seed_data.stock1.id, -1)

    assert response.status_code == 422
    assert "counted_qty" in response.json()["fields"]


def test_adjust_rejects_a_virtual_location(api, seed_data):
    response = adjust(api, seed_data.desk.id, seed_data.vendors.id, 10)

    assert response.status_code == 422
    assert "location_id" in response.json()["fields"]


def test_adjust_unknown_product_or_location_is_404(api, seed_data):
    assert adjust(api, 9999, seed_data.stock1.id, 10).status_code == 404
    assert adjust(api, seed_data.desk.id, 9999, 10).status_code == 404


def test_adjust_rejects_an_unknown_reason(api, seed_data):
    response = adjust(api, seed_data.desk.id, seed_data.stock1.id, 10, reason="shrinkage")

    assert response.status_code == 422
    assert "reason" in response.json()["fields"]


def test_stock_list_statuses(api, db, seed_data):
    # Desk: 5 on hand against a minimum of 10 -> low
    api.put(
        f"/api/products/{seed_data.desk.id}",
        json={
            "name": "Desk",
            "sku": "DESK001",
            "category_id": seed_data.furniture.id,
            "uom": "Unit",
            "unit_cost": 3000,
            "min_qty": 10,
            "active": True,
        },
    )
    adjust(api, seed_data.desk.id, seed_data.stock1.id, 5)
    # Table: 40 on hand, no minimum -> ok
    adjust(api, seed_data.table.id, seed_data.stock1.id, 40)

    body = api.get("/api/stock").json()
    rows = {row["product"]["sku"]: row for row in body["items"]}

    assert body["total"] == 2
    assert rows["DESK001"]["on_hand"] == 5
    assert rows["DESK001"]["status"] == "low"
    assert rows["TABLE001"]["on_hand"] == 40
    assert rows["TABLE001"]["status"] == "ok"

    # Count the desk down to nothing -> out
    adjust(api, seed_data.desk.id, seed_data.stock1.id, 0)
    rows = {row["product"]["sku"]: row for row in api.get("/api/stock").json()["items"]}
    assert rows["DESK001"]["on_hand"] == 0
    assert rows["DESK001"]["status"] == "out"


def test_stock_list_shows_zeros_for_a_product_with_no_quants(api, seed_data):
    body = api.get("/api/stock").json()
    rows = {row["product"]["sku"]: row for row in body["items"]}

    assert rows["DESK001"] == {
        "product": rows["DESK001"]["product"],
        "on_hand": 0,
        "reserved": 0,
        "free_to_use": 0,
        "status": "out",
    }


def test_stock_list_free_to_use_subtracts_reservations(api, db, seed_data):
    adjust(api, seed_data.desk.id, seed_data.stock1.id, 100)
    db.expire_all()
    db.get(StockQuant, (seed_data.desk.id, seed_data.stock1.id)).reserved = Decimal("30")
    db.flush()

    rows = {row["product"]["sku"]: row for row in api.get("/api/stock").json()["items"]}

    assert rows["DESK001"]["on_hand"] == 100
    assert rows["DESK001"]["reserved"] == 30
    assert rows["DESK001"]["free_to_use"] == 70


def test_stock_list_can_filter_by_status_search_and_category(api, seed_data):
    adjust(api, seed_data.desk.id, seed_data.stock1.id, 12)

    ok_only = api.get("/api/stock", params={"status": "ok"}).json()
    out_only = api.get("/api/stock", params={"status": "out"}).json()
    searched = api.get("/api/stock", params={"search": "table0"}).json()
    by_category = api.get(
        "/api/stock", params={"category_id": seed_data.furniture.id}
    ).json()

    assert [r["product"]["sku"] for r in ok_only["items"]] == ["DESK001"]
    assert [r["product"]["sku"] for r in out_only["items"]] == ["TABLE001"]
    assert [r["product"]["sku"] for r in searched["items"]] == ["TABLE001"]
    assert by_category["total"] == 2


def test_stock_list_is_scoped_to_one_warehouse(api, db, seed_data):
    other = api.post(
        "/api/warehouses", json={"name": "Other", "short_code": "OTH", "address": None}
    ).json()
    db.expire_all()
    other_stock = db.scalar(
        select(Location).where(Location.warehouse_id == other["id"])
    )

    adjust(api, seed_data.desk.id, seed_data.stock1.id, 100)
    adjust(api, seed_data.desk.id, other_stock.id, 7)

    everywhere = api.get("/api/stock").json()["items"]
    here = api.get("/api/stock", params={"warehouse_id": seed_data.warehouse.id}).json()
    there = api.get("/api/stock", params={"warehouse_id": other["id"]}).json()

    assert next(r for r in everywhere if r["product"]["sku"] == "DESK001")["on_hand"] == 107
    assert next(r for r in here["items"] if r["product"]["sku"] == "DESK001")["on_hand"] == 100
    assert next(r for r in there["items"] if r["product"]["sku"] == "DESK001")["on_hand"] == 7


def test_stock_list_excludes_inactive_products(api, seed_data):
    api.put(
        f"/api/products/{seed_data.desk.id}",
        json={
            "name": "Desk",
            "sku": "DESK001",
            "category_id": None,
            "uom": "Unit",
            "unit_cost": 3000,
            "min_qty": None,
            "active": False,
        },
    )

    body = api.get("/api/stock").json()
    assert [row["product"]["sku"] for row in body["items"]] == ["TABLE001"]


def test_product_locations_lists_every_internal_location_holding_stock(api, seed_data):
    adjust(api, seed_data.desk.id, seed_data.stock1.id, 60)
    adjust(api, seed_data.desk.id, seed_data.stock2.id, 40)

    body = api.get(f"/api/stock/{seed_data.desk.id}/locations").json()

    assert body["total"] == 2
    rows = {row["location"]["full_name"]: row for row in body["items"]}
    assert rows["WH/Stock1"]["on_hand"] == 60
    assert rows["WH/Stock2"]["on_hand"] == 40
    assert rows["WH/Stock1"]["free_to_use"] == 60
    assert all(row["location"]["type"] == "internal" for row in body["items"])


def test_product_locations_for_an_unknown_product_is_404(api):
    assert api.get("/api/stock/9999/locations").status_code == 404


def test_moves_and_quants_stay_in_agreement(api, db, seed_data):
    """The ledger invariant: in minus out equals the cached balance, everywhere."""
    adjust(api, seed_data.desk.id, seed_data.stock1.id, 100)
    adjust(api, seed_data.desk.id, seed_data.stock1.id, 77, reason="damaged")
    adjust(api, seed_data.desk.id, seed_data.stock2.id, 12)
    adjust(api, seed_data.table.id, seed_data.stock1.id, 5)
    adjust(api, seed_data.table.id, seed_data.stock1.id, 0, reason="lost")
    adjust(api, seed_data.table.id, seed_data.stock2.id, 9)

    db.expire_all()
    internal_ids = set(
        db.scalars(select(Location.id).where(Location.type == LocationType.internal))
    )

    ledger: dict[tuple[int, int], Decimal] = {}
    for move in db.scalars(select(StockMove)):
        if move.to_location_id in internal_ids:
            key = (move.product_id, move.to_location_id)
            ledger[key] = ledger.get(key, Decimal("0")) + move.qty
        if move.from_location_id in internal_ids:
            key = (move.product_id, move.from_location_id)
            ledger[key] = ledger.get(key, Decimal("0")) - move.qty

    quants = {
        (q.product_id, q.location_id): q.quantity
        for q in db.scalars(select(StockQuant))
        if q.location_id in internal_ids
    }

    assert ledger == quants
    assert quants[(seed_data.desk.id, seed_data.stock1.id)] == Decimal("77.000")
    assert quants[(seed_data.desk.id, seed_data.stock2.id)] == Decimal("12.000")
    assert quants[(seed_data.table.id, seed_data.stock1.id)] == Decimal("0.000")
    assert quants[(seed_data.table.id, seed_data.stock2.id)] == Decimal("9.000")

    # Every move belongs to a done adjustment, and none was ever updated.
    operations = db.scalars(select(Operation)).all()
    assert {op.status for op in operations} == {OperationStatus.done}
    assert {op.type for op in operations} == {OperationType.adjustment}
    assert len(operations) == 6
