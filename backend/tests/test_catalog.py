"""Categories and products, including initial stock."""

from decimal import Decimal

from sqlalchemy import func, select

from app.models import Operation, OperationStatus, OperationType, StockMove, StockQuant


def product_payload(**overrides):
    payload = {
        "name": "Steel Sheet",
        "sku": "steel-1",
        "category_id": None,
        "uom": "Unit",
        "unit_cost": 250.5,
        "min_qty": None,
    }
    payload.update(overrides)
    return payload


def test_create_category(api):
    response = api.post("/api/categories", json={"name": "Hardware"})

    assert response.status_code == 201
    assert set(response.json()) == {"id", "name"}
    assert response.json()["name"] == "Hardware"


def test_duplicate_category_differing_only_in_case_conflicts(api, seed_data):
    response = api.post("/api/categories", json={"name": "furniture"})

    assert response.status_code == 409
    body = response.json()
    assert body["code"] == "conflict"
    assert body["fields"] == {"name": "Already in use"}


def test_category_list(api, seed_data):
    body = api.get("/api/categories").json()

    assert body["total"] == 2
    assert [item["name"] for item in body["items"]] == ["Furniture", "Raw Material"]


def test_create_product_trims_and_uppercases_the_sku(api, seed_data):
    response = api.post(
        "/api/products",
        json=product_payload(sku="  steel-1 ", category_id=seed_data.furniture.id),
    )

    assert response.status_code == 201
    body = response.json()
    assert body["sku"] == "STEEL-1"
    assert body["category"] == {"id": seed_data.furniture.id, "name": "Furniture"}
    assert body["unit_cost"] == 250.5, "money is a JSON number, not a string"
    assert body["min_qty"] is None
    assert body["active"] is True


def test_duplicate_sku_differing_only_in_case_conflicts(api, seed_data):
    response = api.post("/api/products", json=product_payload(sku="desk001"))

    assert response.status_code == 409
    assert response.json()["fields"] == {"sku": "Already in use"}


def test_product_validation(api):
    bad = {
        "unit_cost": product_payload(unit_cost=-1),
        "min_qty": product_payload(min_qty=-2),
        "uom": product_payload(uom="  "),
        "name": product_payload(name=""),
    }
    for field, payload in bad.items():
        response = api.post("/api/products", json=payload)
        assert response.status_code == 422, field
        assert field in response.json()["fields"], field


def test_create_product_with_an_unknown_category_is_404(api):
    response = api.post("/api/products", json=product_payload(category_id=9999))

    assert response.status_code == 404
    assert response.json()["code"] == "not_found"


def test_initial_qty_books_one_done_adjustment(api, db, seed_data):
    response = api.post(
        "/api/products",
        json=product_payload(initial_qty=100, initial_location_id=seed_data.stock1.id),
    )

    assert response.status_code == 201
    product_id = response.json()["id"]

    db.expire_all()
    operations = db.scalars(select(Operation)).all()
    assert len(operations) == 1
    operation = operations[0]
    assert operation.reference == "WH/ADJ/0001"
    assert operation.type is OperationType.adjustment
    assert operation.status is OperationStatus.done
    assert operation.validated_at is not None
    assert operation.reason == "count"
    assert operation.note == "Initial stock"
    assert len(operation.lines) == 1
    assert operation.lines[0].qty == Decimal("100.000")

    moves = db.scalars(select(StockMove)).all()
    assert len(moves) == 1
    move = moves[0]
    assert move.from_location_id == seed_data.adjustment.id
    assert move.to_location_id == seed_data.stock1.id
    assert move.qty == Decimal("100.000")
    assert move.reference == "WH/ADJ/0001"
    assert move.direction.value == "in"

    quant = db.get(StockQuant, (product_id, seed_data.stock1.id))
    assert quant.quantity == Decimal("100.000")
    assert quant.reserved == Decimal("0.000")


def test_a_second_initial_stock_product_gets_the_next_reference(api, db, seed_data):
    first = api.post(
        "/api/products",
        json=product_payload(initial_qty=10, initial_location_id=seed_data.stock1.id),
    )
    second = api.post(
        "/api/products",
        json=product_payload(
            name="Copper", sku="COP-1", initial_qty=5, initial_location_id=seed_data.stock1.id
        ),
    )
    assert (first.status_code, second.status_code) == (201, 201)

    db.expire_all()
    references = db.scalars(select(Operation.reference).order_by(Operation.id)).all()
    assert list(references) == ["WH/ADJ/0001", "WH/ADJ/0002"]


def test_initial_qty_without_a_location_is_422(api):
    response = api.post("/api/products", json=product_payload(initial_qty=10))

    assert response.status_code == 422
    assert "initial_location_id" in response.json()["fields"]


def test_initial_qty_into_a_virtual_location_is_422(api, seed_data):
    response = api.post(
        "/api/products",
        json=product_payload(initial_qty=10, initial_location_id=seed_data.vendors.id),
    )

    assert response.status_code == 422
    assert "initial_location_id" in response.json()["fields"]


def test_initial_qty_of_zero_writes_nothing(api, db, seed_data):
    response = api.post(
        "/api/products",
        json=product_payload(initial_qty=0, initial_location_id=seed_data.stock1.id),
    )

    assert response.status_code == 201
    db.expire_all()
    assert db.scalar(select(func.count()).select_from(Operation)) == 0
    assert db.scalar(select(func.count()).select_from(StockMove)) == 0


def test_product_list_search_is_case_insensitive_on_name_and_sku(api, seed_data):
    by_name = api.get("/api/products", params={"search": "desk"}).json()
    by_sku = api.get("/api/products", params={"search": "desk001"}).json()

    assert by_name["total"] == 1
    assert by_name["items"][0]["sku"] == "DESK001"
    assert by_sku["total"] == 1


def test_product_list_filters_by_category(api, seed_data):
    body = api.get(
        "/api/products", params={"category_id": seed_data.furniture.id}
    ).json()

    assert body["total"] == 2
    assert {item["sku"] for item in body["items"]} == {"DESK001", "TABLE001"}


def test_product_list_hides_inactive_products_by_default(api, seed_data):
    api.put(
        f"/api/products/{seed_data.desk.id}",
        json=product_payload(
            name="Desk", sku="DESK001", uom="Unit", unit_cost=3000, active=False
        ),
    )

    default = api.get("/api/products").json()
    inactive = api.get("/api/products", params={"active": False}).json()

    assert {item["sku"] for item in default["items"]} == {"TABLE001"}
    assert {item["sku"] for item in inactive["items"]} == {"DESK001"}


def test_update_product(api, seed_data):
    response = api.put(
        f"/api/products/{seed_data.desk.id}",
        json=product_payload(
            name="Standing Desk",
            sku="desk001",
            uom="Piece",
            unit_cost=4200,
            min_qty=7,
            active=True,
        ),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "Standing Desk"
    assert body["sku"] == "DESK001"
    assert body["uom"] == "Piece"
    assert body["unit_cost"] == 4200
    assert body["min_qty"] == 7


def test_update_product_to_a_taken_sku_conflicts(api, seed_data):
    response = api.put(
        f"/api/products/{seed_data.desk.id}",
        json=product_payload(sku="table001", active=True),
    )

    assert response.status_code == 409
    assert response.json()["fields"] == {"sku": "Already in use"}


def test_update_unknown_product_is_404(api):
    response = api.put("/api/products/9999", json=product_payload(active=True))
    assert response.status_code == 404
