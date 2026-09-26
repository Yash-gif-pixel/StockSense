"""Every endpoint added in Prompt 3 must refuse an unauthenticated caller."""

import pytest

WAREHOUSE = {"name": "Warehouse", "short_code": "WH9", "address": None}
LOCATION = {"warehouse_id": 1, "name": "Bay", "short_code": "BAY"}
PRODUCT = {"name": "Thing", "sku": "THING1", "uom": "Unit", "unit_cost": 1}
ADJUST = {"product_id": 1, "location_id": 1, "counted_qty": 1, "reason": "count"}

ENDPOINTS = [
    ("GET", "/api/warehouses", None),
    ("POST", "/api/warehouses", WAREHOUSE),
    ("PUT", "/api/warehouses/1", WAREHOUSE),
    ("GET", "/api/locations", None),
    ("POST", "/api/locations", LOCATION),
    ("PUT", "/api/locations/1", {"name": "Bay", "short_code": "BAY"}),
    ("GET", "/api/categories", None),
    ("POST", "/api/categories", {"name": "Tools"}),
    ("GET", "/api/products", None),
    ("POST", "/api/products", PRODUCT),
    ("PUT", "/api/products/1", {**PRODUCT, "active": True}),
    ("GET", "/api/stock", None),
    ("GET", "/api/stock/1/locations", None),
    ("POST", "/api/stock/adjust", ADJUST),
]


@pytest.mark.parametrize(
    "method, path, body", ENDPOINTS, ids=[f"{m} {p}" for m, p, _ in ENDPOINTS]
)
def test_endpoint_requires_authentication(client, method, path, body):
    response = client.request(method, path, json=body)

    assert response.status_code == 401, response.text
    assert response.json() == {"code": "unauthorized", "message": "Not authenticated"}
