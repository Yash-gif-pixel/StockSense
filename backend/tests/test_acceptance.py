"""The acceptance scenario from the brief, end to end over HTTP.

Steel and the Production location are created inside the test; only the warehouse,
Stock1 and the virtual locations come from the seed.
"""

from decimal import Decimal

from sqlalchemy import func, select

from app.core.clock import today
from app.models import Location, Operation, StockMove, StockQuant

TODAY = today().isoformat()


def test_receive_transfer_deliver_then_adjust(api, db, seed_data):
    production = api.post(
        "/api/locations",
        json={
            "warehouse_id": seed_data.warehouse.id,
            "name": "Production",
            "short_code": "Production",
        },
    ).json()
    steel = api.post(
        "/api/products",
        json={
            "name": "Steel",
            "sku": "STEEL",
            "category_id": None,
            "uom": "kg",
            "unit_cost": 55,
            "min_qty": None,
        },
    ).json()

    def run(body):
        created = api.post("/api/operations", json=body)
        assert created.status_code == 201, created.text
        operation_id = created.json()["id"]
        assert api.post(f"/api/operations/{operation_id}/todo").status_code == 200
        validated = api.post(f"/api/operations/{operation_id}/validate")
        assert validated.status_code == 200, validated.text
        assert validated.json()["status"] == "done"
        return validated.json()

    # 1. Receive 100 Steel into WH/Stock1
    receipt = run(
        {
            "type": "receipt",
            "contact": "Tata Steel",
            "dest_location_id": seed_data.stock1.id,
            "scheduled_date": TODAY,
            "lines": [{"product_id": steel["id"], "qty": 100}],
        }
    )
    assert receipt["reference"] == "WH/IN/0001"

    # 2. Transfer all 100 to WH/Production
    transfer = run(
        {
            "type": "internal",
            "source_location_id": seed_data.stock1.id,
            "dest_location_id": production["id"],
            "scheduled_date": TODAY,
            "lines": [{"product_id": steel["id"], "qty": 100}],
        }
    )
    assert transfer["reference"] == "WH/INT/0001"

    # 3. Deliver 20 out of WH/Production
    delivery = run(
        {
            "type": "delivery",
            "contact": "Ashok Motors",
            "delivery_address": "MIDC, Pune",
            "source_location_id": production["id"],
            "scheduled_date": TODAY,
            "lines": [{"product_id": steel["id"], "qty": 20}],
        }
    )
    assert delivery["reference"] == "WH/OUT/0001"

    # 4. Count WH/Production and find only 77
    adjusted = api.post(
        "/api/stock/adjust",
        json={
            "product_id": steel["id"],
            "location_id": production["id"],
            "counted_qty": 77,
            "reason": "damaged",
        },
    )
    assert adjusted.status_code == 200
    assert adjusted.json()["changed"] is True
    assert adjusted.json()["operation"]["reference"] == "WH/ADJ/0001"
    assert adjusted.json()["operation"]["lines"][0]["qty"] == 3

    # --- final state -------------------------------------------------------
    db.expire_all()
    by_location = {
        row["location"]["full_name"]: row
        for row in api.get(f"/api/stock/{steel['id']}/locations").json()["items"]
    }
    assert by_location["WH/Production"]["on_hand"] == 77
    assert by_location["WH/Stock1"]["on_hand"] == 0

    stock_row = next(
        row
        for row in api.get("/api/stock").json()["items"]
        if row["product"]["sku"] == "STEEL"
    )
    assert stock_row["on_hand"] == 77
    assert stock_row["free_to_use"] == 77
    assert stock_row["status"] == "ok"

    moves = db.scalars(
        select(StockMove).where(StockMove.product_id == steel["id"]).order_by(StockMove.id)
    ).all()
    assert len(moves) == 4
    assert [move.reference for move in moves] == [
        "WH/IN/0001",
        "WH/INT/0001",
        "WH/OUT/0001",
        "WH/ADJ/0001",
    ]
    assert [move.direction.value for move in moves] == ["in", "internal", "out", "out"]
    assert [move.qty for move in moves] == [
        Decimal("100.000"),
        Decimal("100.000"),
        Decimal("20.000"),
        Decimal("3.000"),
    ]

    quants = db.scalars(
        select(StockQuant).where(StockQuant.product_id == steel["id"])
    ).all()
    assert sum(q.quantity for q in quants) == Decimal("77.000")
    assert all(q.reserved == Decimal("0.000") for q in quants)

    assert db.scalar(select(func.count()).select_from(Operation)) == 4
    assert db.scalar(
        select(func.count()).select_from(Location).where(Location.short_code == "Production")
    ) == 1
