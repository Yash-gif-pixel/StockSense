"""GET /api/moves."""

from datetime import timedelta

import pytest
from sqlalchemy import select

from app.core.clock import day_start, today
from app.models import StockMove

TODAY = today().isoformat()
YESTERDAY = (today() - timedelta(days=1)).isoformat()
TOMORROW = (today() + timedelta(days=1)).isoformat()


@pytest.fixture
def history(api, seed_data):
    """One of every direction: in (receipt), internal (transfer), out (delivery)."""

    def run(body):
        created = api.post("/api/operations", json=body).json()
        api.post(f"/api/operations/{created['id']}/todo")
        assert api.post(f"/api/operations/{created['id']}/validate").status_code == 200
        return created

    receipt = run(
        {
            "type": "receipt",
            "contact": "Tata Steel",
            "dest_location_id": seed_data.stock1.id,
            "scheduled_date": TODAY,
            "lines": [{"product_id": seed_data.desk.id, "qty": 100}],
        }
    )
    transfer = run(
        {
            "type": "internal",
            "source_location_id": seed_data.stock1.id,
            "dest_location_id": seed_data.stock2.id,
            "scheduled_date": TODAY,
            "lines": [{"product_id": seed_data.desk.id, "qty": 40}],
        }
    )
    delivery = run(
        {
            "type": "delivery",
            "contact": "Ashok Motors",
            "delivery_address": "MIDC, Pune",
            "source_location_id": seed_data.stock1.id,
            "scheduled_date": TODAY,
            "lines": [{"product_id": seed_data.desk.id, "qty": 10}],
        }
    )
    return {"receipt": receipt, "transfer": transfer, "delivery": delivery}


def test_move_shape_matches_the_contract(api, history, seed_data):
    body = api.get("/api/moves").json()

    assert body["total"] == 3
    move = body["items"][-1]  # oldest: the receipt
    assert set(move) == {
        "id",
        "created_at",
        "reference",
        "operation_id",
        "contact",
        "product",
        "from_location",
        "to_location",
        "qty",
        "direction",
    }
    assert set(move["product"]) == {"id", "name", "sku"}
    assert move["reference"] == "WH/IN/0001"
    assert move["contact"] == "Tata Steel"
    assert move["direction"] == "in"
    assert move["from_location"]["full_name"] == "Vendors"
    assert move["to_location"]["full_name"] == "WH/Stock1"
    assert move["qty"] == 100
    assert move["created_at"].endswith("Z")
    assert move["operation_id"] == history["receipt"]["id"]


def test_moves_are_newest_first(api, history):
    items = api.get("/api/moves").json()["items"]

    assert [item["reference"] for item in items] == [
        "WH/OUT/0001",
        "WH/INT/0001",
        "WH/IN/0001",
    ]
    ids = [item["id"] for item in items]
    assert ids == sorted(ids, reverse=True)


@pytest.mark.parametrize(
    "direction, expected",
    [
        ("in", ["WH/IN/0001"]),
        ("internal", ["WH/INT/0001"]),
        ("out", ["WH/OUT/0001"]),
    ],
)
def test_direction_filter(api, history, direction, expected):
    body = api.get("/api/moves", params={"direction": direction}).json()

    assert [item["reference"] for item in body["items"]] == expected
    assert all(item["direction"] == direction for item in body["items"])


def test_the_sql_direction_filter_agrees_with_the_model_property(api, db, history):
    """Two implementations of the contract's rule; they must partition identically."""
    db.expire_all()
    from_python: dict[str, set[int]] = {"in": set(), "out": set(), "internal": set()}
    for move in db.scalars(select(StockMove)):
        from_python[move.direction.value].add(move.id)

    for direction, expected_ids in from_python.items():
        body = api.get("/api/moves", params={"direction": direction}).json()
        assert {item["id"] for item in body["items"]} == expected_ids, direction


def test_product_filter(api, history, seed_data):
    mine = api.get("/api/moves", params={"product_id": seed_data.desk.id}).json()
    other = api.get("/api/moves", params={"product_id": seed_data.table.id}).json()

    assert mine["total"] == 3
    assert other["total"] == 0


def test_location_filter_matches_either_end(api, history, seed_data):
    stock1 = api.get("/api/moves", params={"location_id": seed_data.stock1.id}).json()
    stock2 = api.get("/api/moves", params={"location_id": seed_data.stock2.id}).json()

    # Stock1 is the receipt's destination, the transfer's source and the delivery's source.
    assert stock1["total"] == 3
    assert {item["reference"] for item in stock2["items"]} == {"WH/INT/0001"}


@pytest.mark.parametrize(
    "term, expected",
    [
        ("wh/out", {"WH/OUT/0001"}),
        ("ashok", {"WH/OUT/0001"}),
        ("desk001", {"WH/IN/0001", "WH/INT/0001", "WH/OUT/0001"}),
        ("desk", {"WH/IN/0001", "WH/INT/0001", "WH/OUT/0001"}),
        ("nothing-matches", set()),
    ],
    ids=["reference", "contact", "sku", "product name", "miss"],
)
def test_search_covers_reference_contact_sku_and_name(api, history, term, expected):
    body = api.get("/api/moves", params={"search": term}).json()

    assert {item["reference"] for item in body["items"]} == expected


def test_date_filters_are_inclusive_whole_days(api, history):
    today_only = api.get("/api/moves", params={"date_from": TODAY, "date_to": TODAY}).json()
    yesterday_only = api.get(
        "/api/moves", params={"date_from": YESTERDAY, "date_to": YESTERDAY}
    ).json()
    from_tomorrow = api.get("/api/moves", params={"date_from": TOMORROW}).json()
    until_today = api.get("/api/moves", params={"date_to": TODAY}).json()

    assert today_only["total"] == 3, "today is included at both ends of the range"
    assert yesterday_only["total"] == 0
    assert from_tomorrow["total"] == 0
    assert until_today["total"] == 3


def test_date_range_boundaries_use_app_timezone(api, db, history):
    """A move stamped one second before local midnight belongs to the previous day."""
    db.expire_all()
    oldest = db.scalars(select(StockMove).order_by(StockMove.id)).first()
    oldest.created_at = day_start(today()) - timedelta(seconds=1)
    db.flush()

    today_only = api.get("/api/moves", params={"date_from": TODAY, "date_to": TODAY}).json()
    including_yesterday = api.get(
        "/api/moves", params={"date_from": YESTERDAY, "date_to": TODAY}
    ).json()

    assert today_only["total"] == 2
    assert including_yesterday["total"] == 3


def test_date_from_after_date_to_is_422(api, history):
    response = api.get("/api/moves", params={"date_from": TOMORROW, "date_to": YESTERDAY})

    assert response.status_code == 422
    assert response.json()["code"] == "validation_error"
    assert "date_from" in response.json()["fields"]


def test_a_bad_date_is_422(api):
    response = api.get("/api/moves", params={"date_from": "26-09-2026"})

    assert response.status_code == 422
    assert "date_from" in response.json()["fields"]


def test_moves_pagination(api, history):
    first = api.get("/api/moves", params={"limit": 2}).json()
    second = api.get("/api/moves", params={"limit": 2, "offset": 2}).json()

    assert first["total"] == second["total"] == 3
    assert len(first["items"]) == 2
    assert len(second["items"]) == 1


def test_adjustments_appear_in_history(api, seed_data):
    api.post(
        "/api/stock/adjust",
        json={
            "product_id": seed_data.desk.id,
            "location_id": seed_data.stock1.id,
            "counted_qty": 7,
            "reason": "count",
        },
    )

    body = api.get("/api/moves").json()

    assert body["total"] == 1
    move = body["items"][0]
    assert move["reference"] == "WH/ADJ/0001"
    assert move["direction"] == "in"
    assert move["from_location"]["full_name"] == "Inventory Adjustment"
    assert move["contact"] is None


# --- against the demo dataset, which spans two weeks ----------------------


def _demo_history(api, db):
    from scripts import demo_data

    demo_data.build(db)
    db.flush()
    return api.get("/api/moves", params={"limit": 200}).json()


def test_a_date_window_returns_a_strict_subset(api, db):
    everything = _demo_history(api, db)

    window = api.get(
        "/api/moves",
        params={
            "date_from": (today() - timedelta(days=10)).isoformat(),
            "date_to": (today() - timedelta(days=8)).isoformat(),
            "limit": 200,
        },
    ).json()

    all_ids = {item["id"] for item in everything["items"]}
    window_ids = {item["id"] for item in window["items"]}

    assert 0 < window["total"] < everything["total"]
    assert window_ids < all_ids, "the window is not a strict subset"
    assert window["total"] == len(window_ids)


def test_ordering_by_created_at_desc_matches_id_desc(api, db):
    everything = _demo_history(api, db)
    items = everything["items"]

    ids = [item["id"] for item in items]
    stamps = [item["created_at"] for item in items]

    assert len(items) == everything["total"]
    assert ids == sorted(ids, reverse=True)
    # Timestamps are fixed-width UTC Z strings, so lexical order is chronological order.
    assert stamps == sorted(stamps, reverse=True)
    assert len(set(stamps)) == len(stamps), "the demo history has duplicate instants"


def test_the_demo_history_spans_distinct_days(api, db):
    everything = _demo_history(api, db)

    days = {item["created_at"][:10] for item in everything["items"]}

    assert len(days) >= 7, sorted(days)
