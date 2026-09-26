"""GET /api/dashboard."""

from datetime import timedelta

import pytest

from app.core.clock import today

TODAY = today().isoformat()
PAST = (today() - timedelta(days=3)).isoformat()
FUTURE = (today() + timedelta(days=3)).isoformat()


def create(api, **body):
    response = api.post("/api/operations", json=body)
    assert response.status_code == 201, response.text
    return response.json()


def adjust(api, product_id, location_id, qty):
    response = api.post(
        "/api/stock/adjust",
        json={
            "product_id": product_id,
            "location_id": location_id,
            "counted_qty": qty,
            "reason": "count",
        },
    )
    assert response.status_code == 200, response.text


@pytest.fixture
def scenario(api, seed_data):
    """A spread of statuses and dates across all three document types."""
    adjust(api, seed_data.table.id, seed_data.stock1.id, 100)

    # receipts: one draft today, one late draft, one upcoming ready, one done
    create(
        api,
        type="receipt",
        contact="Tata Steel",
        dest_location_id=seed_data.stock1.id,
        scheduled_date=TODAY,
        lines=[{"product_id": seed_data.desk.id, "qty": 5}],
    )
    create(
        api,
        type="receipt",
        contact="Late Supplier",
        dest_location_id=seed_data.stock1.id,
        scheduled_date=PAST,
        lines=[{"product_id": seed_data.desk.id, "qty": 5}],
    )
    upcoming = create(
        api,
        type="receipt",
        contact="Future Supplier",
        dest_location_id=seed_data.stock1.id,
        scheduled_date=FUTURE,
        lines=[{"product_id": seed_data.desk.id, "qty": 5}],
    )
    api.post(f"/api/operations/{upcoming['id']}/todo")
    done = create(
        api,
        type="receipt",
        dest_location_id=seed_data.stock1.id,
        scheduled_date=TODAY,
        lines=[{"product_id": seed_data.desk.id, "qty": 5}],
    )
    api.post(f"/api/operations/{done['id']}/todo")
    api.post(f"/api/operations/{done['id']}/validate")

    # deliveries: one ready, one genuinely waiting, one late pending
    ready = create(
        api,
        type="delivery",
        contact="Ashok Motors",
        source_location_id=seed_data.stock1.id,
        scheduled_date=TODAY,
        lines=[{"product_id": seed_data.table.id, "qty": 10}],
    )
    api.post(f"/api/operations/{ready['id']}/todo")
    short = create(
        api,
        type="delivery",
        contact="Impatient Buyer",
        source_location_id=seed_data.stock2.id,
        scheduled_date=TODAY,
        lines=[{"product_id": seed_data.table.id, "qty": 999}],
    )
    api.post(f"/api/operations/{short['id']}/todo")
    late_delivery = create(
        api,
        type="delivery",
        contact="Overdue Buyer",
        source_location_id=seed_data.stock1.id,
        scheduled_date=PAST,
        lines=[{"product_id": seed_data.table.id, "qty": 1}],
    )

    # internal: one ready, one draft (drafts are not "scheduled")
    transfer = create(
        api,
        type="internal",
        source_location_id=seed_data.stock1.id,
        dest_location_id=seed_data.stock2.id,
        scheduled_date=TODAY,
        lines=[{"product_id": seed_data.table.id, "qty": 5}],
    )
    api.post(f"/api/operations/{transfer['id']}/todo")
    create(
        api,
        type="internal",
        source_location_id=seed_data.stock1.id,
        dest_location_id=seed_data.stock2.id,
        scheduled_date=TODAY,
        lines=[{"product_id": seed_data.table.id, "qty": 1}],
    )
    return {"short": short, "late_delivery": late_delivery}


def test_dashboard_shape(api, seed_data):
    body = api.get("/api/dashboard").json()

    assert set(body) == {"receipts", "deliveries", "internal", "products"}
    assert set(body["receipts"]) == {"ready", "waiting", "late", "upcoming", "pending"}
    assert set(body["deliveries"]) == {"ready", "waiting", "late", "upcoming", "pending"}
    assert set(body["internal"]) == {"scheduled"}
    assert set(body["products"]) == {"in_stock", "low_stock", "out_of_stock"}


def test_receipt_counters(api, scenario):
    receipts = api.get("/api/dashboard").json()["receipts"]

    # draft today, late draft, upcoming ready, plus one done (excluded from pending)
    assert receipts["pending"] == 3
    assert receipts["ready"] == 1
    assert receipts["waiting"] == 0
    assert receipts["late"] == 1
    assert receipts["upcoming"] == 1


def test_delivery_counters(api, scenario):
    deliveries = api.get("/api/dashboard").json()["deliveries"]

    assert deliveries["pending"] == 3
    assert deliveries["ready"] == 1
    assert deliveries["waiting"] == 1
    assert deliveries["late"] == 1
    assert deliveries["upcoming"] == 0


def test_internal_scheduled_counts_only_waiting_and_ready(api, scenario):
    assert api.get("/api/dashboard").json()["internal"]["scheduled"] == 1


def test_done_and_canceled_are_not_pending(api, scenario, seed_data):
    before = api.get("/api/dashboard").json()["deliveries"]["pending"]

    api.post(f"/api/operations/{scenario['late_delivery']['id']}/cancel")

    after = api.get("/api/dashboard").json()["deliveries"]
    assert after["pending"] == before - 1
    assert after["late"] == 0


@pytest.mark.parametrize("scope", ["none", "warehouse", "category"])
def test_product_counts_agree_with_the_stock_endpoint(api, seed_data, scenario, scope):
    """The contract's numbers must be identical whichever screen you read them from."""
    params = {}
    if scope == "warehouse":
        params["warehouse_id"] = seed_data.warehouse.id
    elif scope == "category":
        params["category_id"] = seed_data.furniture.id

    products = api.get("/api/dashboard", params=params).json()["products"]
    ok = api.get("/api/stock", params={**params, "status": "ok"}).json()["total"]
    low = api.get("/api/stock", params={**params, "status": "low"}).json()["total"]
    out = api.get("/api/stock", params={**params, "status": "out"}).json()["total"]

    assert products["low_stock"] == low
    assert products["out_of_stock"] == out
    assert products["in_stock"] == ok + low


def test_product_counts_track_low_and_out(api, seed_data):
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
    adjust(api, seed_data.desk.id, seed_data.stock1.id, 4)  # below the minimum -> low
    adjust(api, seed_data.table.id, seed_data.stock1.id, 30)  # no minimum -> ok

    products = api.get("/api/dashboard").json()["products"]

    assert products["low_stock"] == 1
    assert products["in_stock"] == 2
    assert products["out_of_stock"] == 0


def test_warehouse_scope_counts_operations_at_either_end(api, seed_data, scenario):
    other = api.post(
        "/api/warehouses", json={"name": "Other", "short_code": "OTH", "address": None}
    ).json()

    here = api.get(
        "/api/dashboard", params={"warehouse_id": seed_data.warehouse.id}
    ).json()
    there = api.get("/api/dashboard", params={"warehouse_id": other["id"]}).json()

    assert here["receipts"]["pending"] == 3
    assert there["receipts"]["pending"] == 0
    assert there["deliveries"]["pending"] == 0
    assert there["internal"]["scheduled"] == 0


def test_category_scope_filters_by_line_products(api, seed_data, scenario):
    empty = api.post("/api/categories", json={"name": "Empty"}).json()

    furniture = api.get(
        "/api/dashboard", params={"category_id": seed_data.furniture.id}
    ).json()
    other = api.get("/api/dashboard", params={"category_id": empty["id"]}).json()

    assert furniture["receipts"]["pending"] == 3
    assert other["receipts"]["pending"] == 0
    assert other["products"]["in_stock"] == 0


def test_dashboard_on_an_empty_database_is_all_zeros(api, db):
    from sqlalchemy import text

    db.execute(text("DELETE FROM stock_moves"))
    db.execute(text("DELETE FROM operation_lines"))
    db.execute(text("DELETE FROM operations"))
    db.execute(text("DELETE FROM stock_quants"))
    db.execute(text("UPDATE products SET active = false"))
    db.flush()

    body = api.get("/api/dashboard").json()

    assert body == {
        "receipts": {"ready": 0, "waiting": 0, "late": 0, "upcoming": 0, "pending": 0},
        "deliveries": {"ready": 0, "waiting": 0, "late": 0, "upcoming": 0, "pending": 0},
        "internal": {"scheduled": 0},
        "products": {"in_stock": 0, "low_stock": 0, "out_of_stock": 0},
    }
