"""Operation creation, validation, the state machine and list filters."""

from datetime import timedelta
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.core.clock import today
from app.models import Operation, OperationStatus, StockQuant

TODAY = today().isoformat()
YESTERDAY = (today() - timedelta(days=1)).isoformat()
TOMORROW = (today() + timedelta(days=1)).isoformat()


# --- helpers ---------------------------------------------------------------


def create(api, **body):
    return api.post("/api/operations", json=body)


def act(api, operation_id, action):
    return api.post(f"/api/operations/{operation_id}/{action}")


def receipt_body(seed_data, product_id, qty=10, **overrides):
    body = {
        "type": "receipt",
        "contact": "Tata Steel",
        "dest_location_id": seed_data.stock1.id,
        "scheduled_date": TODAY,
        "lines": [{"product_id": product_id, "qty": qty}],
    }
    body.update(overrides)
    return body


def delivery_body(seed_data, product_id, qty=10, **overrides):
    body = {
        "type": "delivery",
        "contact": "Ashok Motors",
        "delivery_address": "MIDC, Pune",
        "source_location_id": seed_data.stock1.id,
        "scheduled_date": TODAY,
        "lines": [{"product_id": product_id, "qty": qty}],
    }
    body.update(overrides)
    return body


def internal_body(seed_data, product_id, qty=10, **overrides):
    body = {
        "type": "internal",
        "source_location_id": seed_data.stock1.id,
        "dest_location_id": seed_data.stock2.id,
        "scheduled_date": TODAY,
        "lines": [{"product_id": product_id, "qty": qty}],
    }
    body.update(overrides)
    return body


def put_stock(api, seed_data, product_id, qty, location_id=None):
    response = api.post(
        "/api/stock/adjust",
        json={
            "product_id": product_id,
            "location_id": location_id or seed_data.stock1.id,
            "counted_qty": qty,
            "reason": "count",
        },
    )
    assert response.status_code == 200, response.text


# --- creation --------------------------------------------------------------


def test_create_receipt_draft(api, seed_data):
    response = create(api, **receipt_body(seed_data, seed_data.desk.id, 25))

    assert response.status_code == 201
    body = response.json()
    assert body["reference"] == "WH/IN/0001"
    assert body["type"] == "receipt"
    assert body["status"] == "draft"
    assert body["contact"] == "Tata Steel"
    assert body["delivery_address"] is None
    assert body["source_location"]["full_name"] == "Vendors"
    assert body["dest_location"]["full_name"] == "WH/Stock1"
    assert body["scheduled_date"] == TODAY
    assert body["is_late"] is False
    assert body["validated_at"] is None
    assert body["responsible"]["login_id"] == "test_user"
    assert len(body["lines"]) == 1
    assert body["lines"][0]["qty"] == 25
    # Receipts never report source availability.
    assert body["lines"][0]["free_to_use_at_source"] is None
    assert body["lines"][0]["is_short"] is False


def test_create_delivery_draft_reports_source_availability(api, seed_data):
    put_stock(api, seed_data, seed_data.desk.id, 40)

    response = create(api, **delivery_body(seed_data, seed_data.desk.id, 30))

    body = response.json()
    assert response.status_code == 201
    assert body["reference"] == "WH/OUT/0001"
    assert body["dest_location"]["full_name"] == "Customers"
    assert body["delivery_address"] == "MIDC, Pune"
    assert body["lines"][0]["free_to_use_at_source"] == 40
    assert body["lines"][0]["is_short"] is False


def test_create_internal_transfer_draft(api, seed_data):
    response = create(api, **internal_body(seed_data, seed_data.desk.id))

    body = response.json()
    assert response.status_code == 201
    assert body["reference"] == "WH/INT/0001"
    assert body["contact"] is None, "internal transfers have no contact"
    assert body["source_location"]["full_name"] == "WH/Stock1"
    assert body["dest_location"]["full_name"] == "WH/Stock2"
    # Nothing in stock, so the line is short.
    assert body["lines"][0]["free_to_use_at_source"] == 0
    assert body["lines"][0]["is_short"] is True


def test_references_are_numbered_per_type(api, seed_data):
    first = create(api, **receipt_body(seed_data, seed_data.desk.id)).json()
    second = create(api, **receipt_body(seed_data, seed_data.table.id)).json()
    delivery = create(api, **delivery_body(seed_data, seed_data.desk.id)).json()

    assert first["reference"] == "WH/IN/0001"
    assert second["reference"] == "WH/IN/0002"
    assert delivery["reference"] == "WH/OUT/0001"


# --- creation validation ---------------------------------------------------


def test_adjustment_type_is_rejected(api, seed_data):
    response = create(
        api,
        type="adjustment",
        source_location_id=seed_data.stock1.id,
        dest_location_id=seed_data.stock2.id,
        scheduled_date=TODAY,
        lines=[{"product_id": seed_data.desk.id, "qty": 1}],
    )

    assert response.status_code == 422
    assert response.json()["fields"] == {"type": "Not allowed here"}


def test_receipt_into_a_virtual_location_is_rejected(api, seed_data):
    response = create(
        api, **receipt_body(seed_data, seed_data.desk.id, dest_location_id=seed_data.vendors.id)
    )

    assert response.status_code == 422
    assert "dest_location_id" in response.json()["fields"]


def test_delivery_out_of_a_virtual_location_is_rejected(api, seed_data):
    response = create(
        api,
        **delivery_body(
            seed_data, seed_data.desk.id, source_location_id=seed_data.customers.id
        ),
    )

    assert response.status_code == 422
    assert "source_location_id" in response.json()["fields"]


def test_internal_transfer_to_the_same_location_is_rejected(api, seed_data):
    response = create(
        api,
        **internal_body(seed_data, seed_data.desk.id, dest_location_id=seed_data.stock1.id),
    )

    assert response.status_code == 422
    assert "dest_location_id" in response.json()["fields"]


def test_missing_location_is_rejected(api, seed_data):
    response = create(
        api,
        type="receipt",
        scheduled_date=TODAY,
        lines=[{"product_id": seed_data.desk.id, "qty": 1}],
    )

    assert response.status_code == 422
    assert response.json()["fields"] == {"dest_location_id": "Required"}


def test_duplicate_product_lines_are_rejected(api, seed_data):
    response = create(
        api,
        **receipt_body(
            seed_data,
            seed_data.desk.id,
            lines=[
                {"product_id": seed_data.desk.id, "qty": 1},
                {"product_id": seed_data.desk.id, "qty": 2},
            ],
        ),
    )

    assert response.status_code == 422
    assert "lines" in response.json()["fields"]


def test_an_inactive_product_cannot_be_used(api, seed_data):
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

    response = create(api, **receipt_body(seed_data, seed_data.desk.id))

    assert response.status_code == 422
    assert "lines" in response.json()["fields"]


def test_empty_lines_are_rejected(api, seed_data):
    response = create(api, **receipt_body(seed_data, seed_data.desk.id, lines=[]))

    assert response.status_code == 422
    assert "lines" in response.json()["fields"]


def test_a_non_positive_qty_is_rejected(api, seed_data):
    response = create(
        api,
        **receipt_body(
            seed_data, seed_data.desk.id, lines=[{"product_id": seed_data.desk.id, "qty": 0}]
        ),
    )

    assert response.status_code == 422
    assert "lines.0.qty" in response.json()["fields"]


def test_a_missing_scheduled_date_is_rejected(api, seed_data):
    body = receipt_body(seed_data, seed_data.desk.id)
    del body["scheduled_date"]

    response = create(api, **body)

    assert response.status_code == 422
    assert "scheduled_date" in response.json()["fields"]


def test_unknown_product_or_location_is_404(api, seed_data):
    assert create(api, **receipt_body(seed_data, 9999)).status_code == 404
    assert (
        create(
            api, **receipt_body(seed_data, seed_data.desk.id, dest_location_id=9999)
        ).status_code
        == 404
    )


def test_get_unknown_operation_is_404(api):
    assert api.get("/api/operations/9999").status_code == 404


# --- editing ---------------------------------------------------------------


def test_put_replaces_the_lines_and_keeps_the_reference(api, seed_data):
    created = create(api, **receipt_body(seed_data, seed_data.desk.id, 10)).json()

    response = api.put(
        f"/api/operations/{created['id']}",
        json=receipt_body(
            seed_data,
            seed_data.desk.id,
            contact="Someone Else",
            scheduled_date=TOMORROW,
            lines=[
                {"product_id": seed_data.desk.id, "qty": 4},
                {"product_id": seed_data.table.id, "qty": 6},
            ],
        ),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["reference"] == created["reference"]
    assert body["contact"] == "Someone Else"
    assert body["scheduled_date"] == TOMORROW
    assert [line["qty"] for line in body["lines"]] == [4, 6]


def test_put_cannot_change_the_type(api, seed_data):
    created = create(api, **receipt_body(seed_data, seed_data.desk.id)).json()

    response = api.put(
        f"/api/operations/{created['id']}", json=delivery_body(seed_data, seed_data.desk.id)
    )

    assert response.status_code == 422
    assert response.json()["fields"] == {"type": "Cannot be changed"}


def test_put_on_a_non_draft_is_invalid_state(api, seed_data):
    created = create(api, **receipt_body(seed_data, seed_data.desk.id)).json()
    assert act(api, created["id"], "todo").status_code == 200

    response = api.put(
        f"/api/operations/{created['id']}", json=receipt_body(seed_data, seed_data.desk.id)
    )

    assert response.status_code == 409
    assert response.json()["code"] == "invalid_state"


# --- receipt flow ----------------------------------------------------------


def test_receipt_flow_increases_stock(api, db, seed_data):
    created = create(api, **receipt_body(seed_data, seed_data.desk.id, 60)).json()

    ready = act(api, created["id"], "todo")
    assert ready.status_code == 200
    assert ready.json()["status"] == "ready"

    done = act(api, created["id"], "validate")
    assert done.status_code == 200
    assert done.json()["status"] == "done"
    assert done.json()["validated_at"] is not None

    db.expire_all()
    quant = db.get(StockQuant, (seed_data.desk.id, seed_data.stock1.id))
    assert quant.quantity == Decimal("60.000")
    assert quant.reserved == Decimal("0.000")


def test_validating_twice_is_invalid_state(api, seed_data):
    created = create(api, **receipt_body(seed_data, seed_data.desk.id)).json()
    act(api, created["id"], "todo")
    assert act(api, created["id"], "validate").status_code == 200

    second = act(api, created["id"], "validate")
    assert second.status_code == 409
    assert second.json()["code"] == "invalid_state"


# --- delivery flow and reservations ---------------------------------------


def test_delivery_without_stock_waits_and_reports_short(api, seed_data):
    created = create(api, **delivery_body(seed_data, seed_data.desk.id, 20)).json()

    waiting = act(api, created["id"], "todo")
    assert waiting.status_code == 200
    assert waiting.json()["status"] == "waiting"

    detail = api.get(f"/api/operations/{created['id']}").json()
    assert detail["lines"][0]["free_to_use_at_source"] == 0
    assert detail["lines"][0]["is_short"] is True

    # A receipt arrives...
    receipt = create(api, **receipt_body(seed_data, seed_data.desk.id, 20)).json()
    act(api, receipt["id"], "todo")
    act(api, receipt["id"], "validate")

    rechecked = act(api, created["id"], "check-availability")
    assert rechecked.status_code == 200
    assert rechecked.json()["status"] == "ready"
    assert rechecked.json()["lines"][0]["free_to_use_at_source"] is None


def test_check_availability_stays_waiting_when_still_short(api, seed_data):
    put_stock(api, seed_data, seed_data.desk.id, 5)
    created = create(api, **delivery_body(seed_data, seed_data.desk.id, 20)).json()
    act(api, created["id"], "todo")

    response = act(api, created["id"], "check-availability")

    assert response.status_code == 200
    assert response.json()["status"] == "waiting"
    assert response.json()["lines"][0]["free_to_use_at_source"] == 5
    assert response.json()["lines"][0]["is_short"] is True


def test_a_reservation_blocks_a_second_delivery(api, db, seed_data):
    put_stock(api, seed_data, seed_data.desk.id, 50)

    first = create(api, **delivery_body(seed_data, seed_data.desk.id, 30)).json()
    assert act(api, first["id"], "todo").json()["status"] == "ready"

    db.expire_all()
    assert db.get(StockQuant, (seed_data.desk.id, seed_data.stock1.id)).reserved == Decimal(
        "30.000"
    )

    second = create(api, **delivery_body(seed_data, seed_data.desk.id, 30)).json()
    assert act(api, second["id"], "todo").json()["status"] == "waiting"

    # Cancelling the first frees the stock for the second.
    assert act(api, first["id"], "cancel").json()["status"] == "canceled"
    db.expire_all()
    assert db.get(StockQuant, (seed_data.desk.id, seed_data.stock1.id)).reserved == Decimal(
        "0.000"
    )

    assert act(api, second["id"], "check-availability").json()["status"] == "ready"


def test_cancel_from_ready_releases_the_reservation(api, seed_data):
    put_stock(api, seed_data, seed_data.desk.id, 50)
    created = create(api, **delivery_body(seed_data, seed_data.desk.id, 20)).json()
    act(api, created["id"], "todo")

    reserved_row = next(
        row
        for row in api.get("/api/stock").json()["items"]
        if row["product"]["sku"] == "DESK001"
    )
    assert reserved_row["reserved"] == 20
    assert reserved_row["free_to_use"] == 30

    assert act(api, created["id"], "cancel").json()["status"] == "canceled"

    released = next(
        row
        for row in api.get("/api/stock").json()["items"]
        if row["product"]["sku"] == "DESK001"
    )
    assert released["reserved"] == 0
    assert released["free_to_use"] == released["on_hand"] == 50


def test_delivery_validate_removes_stock(api, db, seed_data):
    put_stock(api, seed_data, seed_data.desk.id, 50)
    created = create(api, **delivery_body(seed_data, seed_data.desk.id, 20)).json()
    act(api, created["id"], "todo")

    assert act(api, created["id"], "validate").json()["status"] == "done"

    db.expire_all()
    quant = db.get(StockQuant, (seed_data.desk.id, seed_data.stock1.id))
    assert quant.quantity == Decimal("30.000")
    assert quant.reserved == Decimal("0.000")


def test_internal_transfer_moves_between_locations(api, db, seed_data):
    put_stock(api, seed_data, seed_data.desk.id, 40)
    created = create(api, **internal_body(seed_data, seed_data.desk.id, 15)).json()
    act(api, created["id"], "todo")
    act(api, created["id"], "validate")

    db.expire_all()
    assert db.get(StockQuant, (seed_data.desk.id, seed_data.stock1.id)).quantity == Decimal(
        "25.000"
    )
    assert db.get(StockQuant, (seed_data.desk.id, seed_data.stock2.id)).quantity == Decimal(
        "15.000"
    )


def test_cancel_from_draft_needs_no_reservation(api, seed_data):
    created = create(api, **delivery_body(seed_data, seed_data.desk.id)).json()

    assert act(api, created["id"], "cancel").json()["status"] == "canceled"


# --- wrong-state transitions ----------------------------------------------


@pytest.mark.parametrize("action", ["check-availability", "validate"])
def test_actions_that_need_a_later_state_reject_a_draft(api, seed_data, action):
    created = create(api, **receipt_body(seed_data, seed_data.desk.id)).json()

    response = act(api, created["id"], action)

    assert response.status_code == 409
    assert response.json()["code"] == "invalid_state"


@pytest.mark.parametrize("action", ["todo", "check-availability", "validate", "cancel"])
def test_a_done_operation_rejects_every_action(api, seed_data, action):
    created = create(api, **receipt_body(seed_data, seed_data.desk.id)).json()
    act(api, created["id"], "todo")
    act(api, created["id"], "validate")

    response = act(api, created["id"], action)

    assert response.status_code == 409
    assert response.json()["code"] == "invalid_state"


@pytest.mark.parametrize("action", ["todo", "check-availability", "validate", "cancel"])
def test_an_adjustment_rejects_every_action(api, seed_data, action):
    adjusted = api.post(
        "/api/stock/adjust",
        json={
            "product_id": seed_data.desk.id,
            "location_id": seed_data.stock1.id,
            "counted_qty": 10,
            "reason": "count",
        },
    ).json()
    operation_id = adjusted["operation"]["id"]

    response = act(api, operation_id, action)

    assert response.status_code == 409
    assert response.json()["code"] == "invalid_state"


def test_an_adjustment_cannot_be_edited(api, seed_data):
    adjusted = api.post(
        "/api/stock/adjust",
        json={
            "product_id": seed_data.desk.id,
            "location_id": seed_data.stock1.id,
            "counted_qty": 10,
            "reason": "count",
        },
    ).json()

    response = api.put(
        f"/api/operations/{adjusted['operation']['id']}",
        json=receipt_body(seed_data, seed_data.desk.id),
    )

    assert response.status_code == 409
    assert response.json()["code"] == "invalid_state"


def test_actions_on_an_unknown_operation_are_404(api):
    assert act(api, 9999, "todo").status_code == 404


# --- list ------------------------------------------------------------------


@pytest.fixture
def listed(api, seed_data):
    """A receipt (draft), a delivery (ready), an internal transfer (late draft)."""
    receipt = create(api, **receipt_body(seed_data, seed_data.desk.id, 10)).json()

    put_stock(api, seed_data, seed_data.table.id, 50)
    delivery = create(
        api,
        **delivery_body(seed_data, seed_data.table.id, 10, contact="Ashok Motors"),
    ).json()
    act(api, delivery["id"], "todo")

    transfer = create(
        api, **internal_body(seed_data, seed_data.desk.id, 5, scheduled_date=YESTERDAY)
    ).json()
    return {"receipt": receipt, "delivery": delivery, "transfer": transfer}


def test_list_is_newest_first(api, listed):
    body = api.get("/api/operations").json()

    # 3 documents plus the adjustment the delivery fixture needed for stock.
    assert body["total"] == 4
    ids = [item["id"] for item in body["items"]]
    assert ids == sorted(ids, reverse=True)
    assert set(body["items"][0]) == {
        "id",
        "reference",
        "type",
        "status",
        "contact",
        "source_location",
        "dest_location",
        "scheduled_date",
        "is_late",
    }


def test_list_filters_by_type(api, listed):
    body = api.get("/api/operations", params={"type": "receipt"}).json()

    assert body["total"] == 1
    assert body["items"][0]["reference"] == "WH/IN/0001"


def test_list_accepts_comma_separated_statuses(api, listed):
    both = api.get("/api/operations", params={"status": "draft,ready"}).json()
    ready_only = api.get("/api/operations", params={"status": "ready"}).json()

    assert {item["status"] for item in both["items"]} == {"draft", "ready"}
    assert both["total"] == 3
    assert ready_only["total"] == 1


def test_list_rejects_an_unknown_status(api, listed):
    response = api.get("/api/operations", params={"status": "draft,nonsense"})

    assert response.status_code == 422
    assert "status" in response.json()["fields"]


def test_list_filters_by_late(api, listed):
    late = api.get("/api/operations", params={"late": True}).json()
    not_late = api.get("/api/operations", params={"late": False}).json()

    assert [item["reference"] for item in late["items"]] == ["WH/INT/0001"]
    assert all(item["is_late"] for item in late["items"])
    assert "WH/INT/0001" not in {item["reference"] for item in not_late["items"]}


def test_list_search_matches_reference_and_contact(api, listed):
    by_reference = api.get("/api/operations", params={"search": "wh/out"}).json()
    by_contact = api.get("/api/operations", params={"search": "ashok"}).json()

    assert [item["reference"] for item in by_reference["items"]] == ["WH/OUT/0001"]
    assert [item["reference"] for item in by_contact["items"]] == ["WH/OUT/0001"]


def test_list_filters_by_warehouse_on_either_end(api, seed_data, listed):
    other = api.post(
        "/api/warehouses", json={"name": "Other", "short_code": "OTH", "address": None}
    ).json()

    here = api.get("/api/operations", params={"warehouse_id": seed_data.warehouse.id}).json()
    there = api.get("/api/operations", params={"warehouse_id": other["id"]}).json()

    assert here["total"] == 4, "receipts match on destination, deliveries on source"
    assert there["total"] == 0


def test_list_filters_by_category(api, seed_data, listed):
    matching = api.get(
        "/api/operations", params={"category_id": seed_data.furniture.id}
    ).json()
    empty = api.post("/api/categories", json={"name": "Empty"}).json()
    other = api.get("/api/operations", params={"category_id": empty["id"]}).json()

    assert matching["total"] == 4
    assert other["total"] == 0


def test_list_pagination(api, listed):
    first = api.get("/api/operations", params={"limit": 2, "offset": 0}).json()
    second = api.get("/api/operations", params={"limit": 2, "offset": 2}).json()

    assert first["total"] == second["total"] == 4
    assert len(first["items"]) == 2
    assert len(second["items"]) == 2
    assert {i["id"] for i in first["items"]}.isdisjoint({i["id"] for i in second["items"]})


def test_reserved_matches_ready_outgoing_lines(api, db, listed, seed_data):
    """The ledger's second invariant: reservations are exactly the ready outgoing lines."""
    db.expire_all()
    ready_outgoing: dict[tuple[int, int], Decimal] = {}
    for operation in db.scalars(
        select(Operation).where(Operation.status == OperationStatus.ready)
    ):
        if operation.type.value not in ("delivery", "internal"):
            continue
        for line in operation.lines:
            key = (line.product_id, operation.source_location_id)
            ready_outgoing[key] = ready_outgoing.get(key, Decimal("0")) + line.qty

    reserved = {
        (quant.product_id, quant.location_id): quant.reserved
        for quant in db.scalars(select(StockQuant))
        if quant.reserved != Decimal("0")
    }

    assert reserved == ready_outgoing
