"""Warehouses and locations."""

from sqlalchemy import func, select

from app.models import Location, LocationType, Operation, ReferenceSequence, Warehouse
from app.services.sequences import REFERENCE_CODES


def test_create_warehouse_also_creates_stock_location_and_sequences(api, db):
    response = api.post(
        "/api/warehouses",
        json={"name": "Second Warehouse", "short_code": "wh2", "address": "Nashik"},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["short_code"] == "WH2", "short_code is stored uppercase"
    assert body["name"] == "Second Warehouse"
    assert body["address"] == "Nashik"

    db.expire_all()
    locations = db.scalars(
        select(Location).where(Location.warehouse_id == body["id"])
    ).all()
    assert len(locations) == 1
    stock = locations[0]
    assert (stock.name, stock.short_code, stock.type) == (
        "Stock",
        "Stock",
        LocationType.internal,
    )
    assert stock.full_name == "WH2/Stock"

    sequences = db.scalars(
        select(ReferenceSequence).where(ReferenceSequence.warehouse_id == body["id"])
    ).all()
    assert len(sequences) == len(REFERENCE_CODES)
    assert {s.op_type for s in sequences} == {t.value for t in REFERENCE_CODES}
    assert {s.next_value for s in sequences} == {1}


def test_duplicate_warehouse_short_code_conflicts_ignoring_case(api):
    response = api.post(
        "/api/warehouses", json={"name": "Clash", "short_code": "wh", "address": None}
    )

    assert response.status_code == 409
    body = response.json()
    assert body["code"] == "conflict"
    assert body["fields"] == {"short_code": "Already in use"}


def test_warehouse_short_code_format_is_enforced(api):
    for short_code in ["WH-2", "TOOLONGCODE", "with space", ""]:
        response = api.post(
            "/api/warehouses",
            json={"name": "Bad", "short_code": short_code, "address": None},
        )
        assert response.status_code == 422, short_code
        assert "short_code" in response.json()["fields"]


def test_changing_a_warehouse_short_code_leaves_existing_references_alone(
    api, db, seed_data
):
    adjust = api.post(
        "/api/stock/adjust",
        json={
            "product_id": seed_data.desk.id,
            "location_id": seed_data.stock1.id,
            "counted_qty": 5,
            "reason": "count",
        },
    )
    assert adjust.status_code == 200
    reference = adjust.json()["operation"]["reference"]
    assert reference == "WH/ADJ/0001"

    renamed = api.put(
        f"/api/warehouses/{seed_data.warehouse.id}",
        json={"name": "Main Warehouse", "short_code": "MAIN", "address": None},
    )
    assert renamed.status_code == 200
    assert renamed.json()["short_code"] == "MAIN"

    db.expire_all()
    stored = db.scalar(select(Operation.reference).where(Operation.reference == reference))
    assert stored == "WH/ADJ/0001", "stored references are plain strings and must not move"
    # New documents pick up the new code.
    again = api.post(
        "/api/stock/adjust",
        json={
            "product_id": seed_data.desk.id,
            "location_id": seed_data.stock1.id,
            "counted_qty": 9,
            "reason": "count",
        },
    )
    assert again.json()["operation"]["reference"] == "MAIN/ADJ/0002"


def test_update_warehouse_404(api):
    response = api.put(
        "/api/warehouses/9999", json={"name": "X", "short_code": "X1", "address": None}
    )
    assert response.status_code == 404
    assert response.json()["code"] == "not_found"


def test_limit_above_the_maximum_is_rejected(api):
    assert api.get("/api/warehouses", params={"limit": 200}).status_code == 200
    response = api.get("/api/warehouses", params={"limit": 201})
    assert response.status_code == 422
    assert "limit" in response.json()["fields"]


def test_location_list_defaults_to_internal(api, seed_data):
    response = api.get("/api/locations")

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 2
    assert {item["short_code"] for item in body["items"]} == {"Stock1", "Stock2"}
    assert {item["type"] for item in body["items"]} == {"internal"}
    assert {item["full_name"] for item in body["items"]} == {"WH/Stock1", "WH/Stock2"}


def test_location_list_can_ask_for_virtual_types(api, seed_data):
    response = api.get("/api/locations", params={"type": "vendor"})

    body = response.json()
    assert body["total"] == 1
    item = body["items"][0]
    assert item["warehouse_id"] is None
    assert item["full_name"] == "Vendors", "virtual locations use the plain name"


def test_location_list_filters_by_warehouse(api, seed_data):
    other = api.post(
        "/api/warehouses", json={"name": "Other", "short_code": "OTH", "address": None}
    ).json()

    mine = api.get("/api/locations", params={"warehouse_id": seed_data.warehouse.id}).json()
    theirs = api.get("/api/locations", params={"warehouse_id": other["id"]}).json()

    assert mine["total"] == 2
    assert theirs["total"] == 1
    assert theirs["items"][0]["full_name"] == "OTH/Stock"


def test_create_location(api, seed_data):
    response = api.post(
        "/api/locations",
        json={
            "warehouse_id": seed_data.warehouse.id,
            "name": "Production",
            "short_code": "Production",
        },
    )

    assert response.status_code == 201
    body = response.json()
    assert body["type"] == "internal"
    assert body["full_name"] == "WH/Production"
    assert body["warehouse_id"] == seed_data.warehouse.id


def test_duplicate_location_short_code_in_the_same_warehouse_conflicts(api, seed_data):
    response = api.post(
        "/api/locations",
        json={
            "warehouse_id": seed_data.warehouse.id,
            "name": "Another Stock1",
            "short_code": "Stock1",
        },
    )

    assert response.status_code == 409
    assert response.json()["fields"] == {
        "short_code": "Already in use in this warehouse"
    }


def test_the_same_location_short_code_in_another_warehouse_is_fine(api, seed_data):
    other = api.post(
        "/api/warehouses", json={"name": "Other", "short_code": "OTH", "address": None}
    ).json()

    response = api.post(
        "/api/locations",
        json={"warehouse_id": other["id"], "name": "Stock1", "short_code": "Stock1"},
    )

    assert response.status_code == 201
    assert response.json()["full_name"] == "OTH/Stock1"


def test_create_location_for_an_unknown_warehouse_is_404(api):
    response = api.post(
        "/api/locations",
        json={"warehouse_id": 9999, "name": "Nowhere", "short_code": "NW"},
    )

    assert response.status_code == 404
    assert response.json()["code"] == "not_found"


def test_location_short_code_format_is_enforced(api, seed_data):
    response = api.post(
        "/api/locations",
        json={
            "warehouse_id": seed_data.warehouse.id,
            "name": "Bad",
            "short_code": "has space",
        },
    )
    assert response.status_code == 422
    assert "short_code" in response.json()["fields"]


def test_update_location(api, seed_data):
    response = api.put(
        f"/api/locations/{seed_data.stock2.id}",
        json={"name": "Packing", "short_code": "Packing"},
    )

    assert response.status_code == 200
    assert response.json()["full_name"] == "WH/Packing"


def test_update_location_rejects_virtual_locations(api, seed_data):
    response = api.put(
        f"/api/locations/{seed_data.vendors.id}",
        json={"name": "Suppliers", "short_code": "SUP"},
    )

    assert response.status_code == 422
    assert response.json()["code"] == "validation_error"


def test_update_location_404(api):
    response = api.put("/api/locations/9999", json={"name": "X", "short_code": "X"})
    assert response.status_code == 404


def test_warehouse_list_shape(api, seed_data):
    body = api.get("/api/warehouses").json()

    assert body["total"] == 1
    assert set(body["items"][0]) == {"id", "name", "short_code", "address"}


def test_seeded_warehouse_count_matches_total(api, db):
    body = api.get("/api/warehouses").json()
    assert body["total"] == db.scalar(select(func.count()).select_from(Warehouse))
